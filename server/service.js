'use strict';
const {createHash}=require('node:crypto');
const {fail,text,id,cents,decimal,storedCents,date,customer,clean}=require('./domain');
const {nextId}=require('./database');
const statuses=['Pending','In Progress','Ready for Pickup','Collected'];
async function snapshot(db,user) {
  const names=['customers','services','orders','payments'];const data={user:clean(user)};
  for(const name of names) {
    const records=await db.collection(name).find({}).limit(10001).toArray();
    if(records.length>10000)fail('The workspace exceeds the current bootstrap limit. Server-side UI pagination is required.',413);
    data[name]=clean(records);
  }
  data.users=clean(await db.collection('users').find({},{projection:{user_id:1,first_name:1,last_name:1}}).toArray());
  return data;
}
async function command(client,db,user,body,key) {
  if(!/^[a-zA-Z0-9-]{16,100}$/.test(key||''))fail('An Idempotency-Key header is required.');
  const digest=createHash('sha256').update(JSON.stringify(body)).digest('hex');
  const session=client.startSession();
  let mutation={};
  try {
    await session.withTransaction(async()=>{
      const opts={session};
      const previous=await db.collection('operations').findOne({user_id:user.user_id,key},opts);
      if(previous){if(previous.digest!==digest)fail('This request key was already used for different data.',409);mutation=previous.mutation;return;}
      if(!body.order&&!body.payment)fail('Provide an order or payment change.');
      let order;
      if(body.order) {
        const input=body.order;
        if(input.order_id) {
          order=await db.collection('orders').findOne({order_id:id(input.order_id)},opts);
          if(!order)fail('Order not found.',404);
          if(input._version!==order._version)fail('This order changed. Reload before editing.',409);
          if(!statuses.includes(input.order_status))fail('Choose a valid order status.');
          const completion=date(input.estimated_completion,'Estimated completion',true);
          if(completion&&completion<order.order_date)fail('Completion must not precede placement.');
          await db.collection('orders').updateOne({order_id:order.order_id},{$set:{order_status:input.order_status,estimated_completion:completion},$inc:{_version:1}},opts);
        } else {
          const customerId=id(input.customer_id,'Customer'),serviceId=id(input.service_id,'Service');
          const selectedCustomer=await db.collection('customers').findOne({customer_id:customerId},opts);
          const service=await db.collection('services').findOne({service_id:serviceId,service_status:'Active'},opts);
          if(!selectedCustomer||!service)fail('Choose an existing customer and active service.');
          // A shared write prevents a concurrent customer deletion from leaving an orphan.
          await db.collection('customers').updateOne({customer_id:customerId},{$inc:{_link_version:1}},opts);
          let weight=input.weight===null||input.weight===undefined||input.weight===''?null:Number(input.weight);
          if(weight!==null&&(!Number.isFinite(weight)||weight<=0||weight>999.99||Math.abs(weight*100-Math.round(weight*100))>1e-6))fail('Weight must be 0.01–999.99 kg with at most two decimals.');
          let quantity;
          if(service.pricing_unit==='per kg'){if(weight===null)fail('Weight is required for this service.');quantity=weight;}
          else if(service.pricing_unit==='per load'){quantity=input.loads;if(!Number.isInteger(quantity)||quantity<1||quantity>1000)fail('Enter 1–1,000 whole loads.');}
          else fail('This pricing unit is not supported.');
          const subtotal=Math.round(storedCents(service.unit_price)*quantity),discount=cents(input.discount??0,'Discount');
          if(discount>subtotal||subtotal>9999999999)fail('Check the discount and order amount.');
          const placed=date(input.order_date,'Date placed'),completion=date(input.estimated_completion,'Completion',true);
          if(completion&&completion<placed)fail('Completion must not precede placement.');
          const orderId=await nextId(db,'orders',session);
          const year=new Intl.DateTimeFormat('en',{timeZone:'Asia/Manila',year:'numeric'}).format(placed);
          order={order_id:orderId,order_number:`ORD-${year}-${String(orderId).padStart(6,'0')}`,customer_id:customerId,service_id:serviceId,created_by:user.user_id,order_date:placed,weight,subtotal:decimal(subtotal),discount:decimal(discount),total_amount:decimal(subtotal-discount),order_status:'Pending',estimated_completion:completion,_version:1};
          await db.collection('orders').insertOne(order,opts);
        }
      }
      if(body.payment) {
        const input=body.payment;
        const existing=input.payment_id?await db.collection('payments').findOne({payment_id:id(input.payment_id)},opts):null;
        if(input.payment_id&&!existing)fail('Payment not found.',404);
        if(existing&&existing._version!==input._version)fail('This payment changed. Reload before editing.',409);
        const orderId=existing?.order_id??id(input.order_id,'Order');
        if(existing&&input.order_id!==undefined&&input.order_id!==existing.order_id)fail('A payment cannot be moved to another order.');
        if(order&&body.order.order_id&&order.order_id!==orderId)fail('Order and payment must refer to the same order.');
        const linked=await db.collection('orders').findOne({order_id:orderId},opts);
        if(!linked)fail('Order not found.',404);
        await db.collection('orders').updateOne({order_id:orderId},{$inc:{_version:1}},opts);
        const amount=cents(input.amount_paid);
        if(amount<=0)fail('Payment must be greater than zero.');
        if(!['Paid','Pending'].includes(input.payment_status))fail('Choose Paid or Pending.');
        if(!['Cash','GCash','Card','Bank transfer'].includes(input.payment_method))fail('Choose a supported payment method.');
        const receipts=await db.collection('payments').find({order_id:orderId,payment_status:'Paid',...(existing?{payment_id:{$ne:existing.payment_id}}:{})},opts).toArray();
        const paid=receipts.reduce((sum,payment)=>sum+storedCents(payment.amount_paid),0);
        if(input.payment_status==='Paid'&&paid+amount>storedCents(linked.total_amount))fail('Payment exceeds the remaining balance.',409);
        const record={payment_id:existing?.payment_id??await nextId(db,'payments',session),order_id:orderId,received_by:existing?.received_by??user.user_id,payment_date:date(input.payment_date,'Payment date'),amount_paid:decimal(amount),payment_method:input.payment_method,payment_status:input.payment_status,reference_number:text(input.reference_number,'Reference',30,true),_version:(existing?existing._version:0)+1};
        if(existing)await db.collection('payments').replaceOne({payment_id:existing.payment_id},record,opts);else await db.collection('payments').insertOne(record,opts);
        mutation.payment_id=record.payment_id;
      }
      if(order)mutation.order_id=order.order_id;
      await db.collection('operations').insertOne({user_id:user.user_id,key,digest,mutation,created_at:new Date()},opts);
      await db.collection('audit').insertOne({actor_id:user.user_id,action:'ledger.change',order_id:order?.order_id??body.payment?.order_id??null,created_at:new Date()},opts);
    });
  } catch(error) {
    if(error.code===11000){const previous=await db.collection('operations').findOne({user_id:user.user_id,key});if(!previous||previous.digest!==digest)throw error;mutation=previous.mutation;}else throw error;
  } finally {await session.endSession();}
  return {...await snapshot(db,user),mutation};
}
async function saveCustomer(client,db,body,customerId,meta={}) {
  const record=customer(body);
  if(!customerId){
    if(!/^[a-zA-Z0-9-]{16,100}$/.test(meta.key||''))fail('An Idempotency-Key header is required.');
    const digest=createHash('sha256').update('customer.create:'+JSON.stringify(body)).digest('hex');
    let createdId;const session=client.startSession();
    try {await session.withTransaction(async()=>{
      const previous=await db.collection('operations').findOne({user_id:meta.userId,key:meta.key},{session});
      if(previous){if(previous.digest!==digest)fail('This request key was used for different data.',409);createdId=previous.customer_id;return;}
      createdId=await nextId(db,'customers',session);
      await db.collection('customers').insertOne({...record,customer_id:createdId,created_at:new Date(),_version:1},{session});
      await db.collection('operations').insertOne({user_id:meta.userId,key:meta.key,digest,customer_id:createdId,created_at:new Date()},{session});
    });}catch(error){
      if(error.code!==11000)throw error;
      const previous=await db.collection('operations').findOne({user_id:meta.userId,key:meta.key});
      if(!previous||previous.digest!==digest)throw error;createdId=previous.customer_id;
    }finally{await session.endSession();}
    const created=await db.collection('customers').findOne({customer_id:createdId});if(!created)fail('This customer was created earlier but no longer exists.',409);return clean(created);
  }
  const result=await db.collection('customers').findOneAndUpdate({customer_id:id(customerId),_version:id(body._version,'Version')},{$set:record,$inc:{_version:1}},{returnDocument:'after'});
  if(!result)fail('Customer changed or no longer exists. Reload before editing.',409);return clean(result);
}
async function deleteCustomer(client,db,customerId,version) {
  const session=client.startSession();
  try {await session.withTransaction(async()=>{
    const found=await db.collection('customers').findOne({customer_id:customerId},{session});
    if(!found)fail('Customer not found.',404);
    if(found._version!==version)fail('Customer changed. Reload before deleting.',409);
    if(await db.collection('orders').findOne({customer_id:customerId},{session}))fail('Customers with orders cannot be deleted.',409);
    await db.collection('customers').deleteOne({customer_id:customerId},{session});
  });}finally{await session.endSession();}
}
module.exports={snapshot,command,saveCustomer,deleteCustomer};
