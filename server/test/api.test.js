'use strict';
const {before,after,test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {MongoMemoryReplSet}=require('mongodb-memory-server');
const {MongoClient}=require('mongodb');
const request=require('supertest');
const {initialize,provision}=require('../database');
const {createApp}=require('../app');
let replica,client,db,app,agent;
const origin='http://localhost:3000';
const pass='Test-only-password-123!';
before(async()=>{
  replica=await MongoMemoryReplSet.create({replSet:{count:1},instanceOpts:[{args:['--wiredTigerCacheSizeGB','0.25']}]});
  client=new MongoClient(replica.getUri());await client.connect();db=client.db('bubblewash_test');await initialize(db);await provision(db,{username:'testadmin',password:pass});
  app=await createApp({client,db,origin});agent=request.agent(app);await agent.post('/api/auth/login').set('Origin',origin).send({username:'testadmin',password:pass}).expect(200);
}, {timeout:240000});
after(async()=>{await client?.close();await replica?.stop();});
const post=(url,body)=>agent.post(url).set('Origin',origin).set('Idempotency-Key',randomUUID()).send(body);
const command=(body,key=randomUUID())=>agent.post('/api/commands').set('Origin',origin).set('Idempotency-Key',key).send(body);
async function customer(name='Maria') {const result=await post('/api/customers',{first_name:name,last_name:'Santos',contact_number:null}).expect(201);return result.body;}
async function order(customerId,extra={}) {const result=await command({order:{customer_id:customerId,service_id:1,weight:1,discount:0,order_date:'2031-11-09T10:00:00+08:00',estimated_completion:null,...extra}}).expect(200);return result.body.orders.find((row)=>row.order_id===result.body.mutation.order_id);}
test('Authentication, origin protection, and private files',async()=>{
  await request(app).get('/api/bootstrap').expect(401);
  await request(app).get('/.env').expect(404);await request(app).get('/server/start.js').expect(404);
  await request(app).post('/api/auth/login').set('Origin','https://untrusted.example').send({username:'testadmin',password:pass}).expect(403);
  await request(app).post('/api/auth/login').set('Origin',origin).send({username:'testadmin',password:'wrong'}).expect(401);
  const response=await agent.get('/api/bootstrap').expect(200);assert.equal(response.body.services.length,3);assert.equal(response.body.user.password_hash,undefined);
});
test('Customer validation, null contact, full-name search, edit conflicts and deletion',async()=>{
  await post('/api/customers',{first_name:'a'.repeat(31),last_name:'Santos'}).expect(400);
  const c=await customer('Searchable');assert.equal(c.contact_number,null);
  await agent.patch(`/api/customers/${c.customer_id}`).set('Origin',origin).send({_version:{$gte:1},first_name:'Bypass',last_name:'Santos'}).expect(400);
  const key=randomUUID(),payload={first_name:'Once',last_name:'Only',contact_number:null};
  const first=await agent.post('/api/customers').set('Origin',origin).set('Idempotency-Key',key).send(payload).expect(201);
  const again=await agent.post('/api/customers').set('Origin',origin).set('Idempotency-Key',key).send(payload).expect(201);
  assert.equal(first.body.customer_id,again.body.customer_id);
  const found=await agent.get('/api/customers').query({q:'Searchable Santos'}).expect(200);assert.equal(found.body.total,1);
  assert.equal((await agent.get('/api/customers').query({q:'.*'})).body.total,0);
  await agent.patch(`/api/customers/${c.customer_id}`).set('Origin',origin).send({_version:1,first_name:'Edited',last_name:'Santos',contact_number:null}).expect(200);
  await agent.patch(`/api/customers/${c.customer_id}`).set('Origin',origin).send({_version:1,first_name:'Stale',last_name:'Santos'}).expect(409);
  await agent.delete(`/api/customers/${c.customer_id}`).set('Origin',origin).send({_version:2}).expect(200);
});
test('Server pricing, customer/service references, optional fields and unique order numbers',async()=>{
  const c=await customer();const o=await order(c.customer_id,{weight:6.5,total_amount:0,created_by:999});
  assert.equal(o.total_amount,227.5);assert.equal(o.created_by,1);assert.match(o.order_number,/^ORD-2031-/);assert.equal(o.estimated_completion,null);
  await command({order:{customer_id:9999,service_id:1,weight:1,order_date:o.order_date}}).expect(400);
  await command({order:{customer_id:c.customer_id,service_id:1,weight:1000,order_date:o.order_date}}).expect(400);
  const load=await order(c.customer_id,{service_id:3,weight:null,loads:2});assert.equal(load.total_amount,300);assert.equal(load.weight,null);
  await agent.delete(`/api/customers/${c.customer_id}`).set('Origin',origin).send({_version:c._version}).expect(409);
});
test('Atomic collection/payment, duplicate retries and receipt correction',async()=>{
  const c=await customer();const o=await order(c.customer_id);const key=randomUUID();
  const body={order:{order_id:o.order_id,_version:o._version,order_status:'Collected',estimated_completion:null},payment:{order_id:o.order_id,amount_paid:35,payment_status:'Paid',payment_method:'GCash',payment_date:'2031-11-09T12:00:00+08:00',reference_number:'TEST'}};
  const first=await command(body,key).expect(200);await command(body,key).expect(200);
  assert.equal(await db.collection('payments').countDocuments({order_id:o.order_id}),1);
  assert.equal((await db.collection('orders').findOne({order_id:o.order_id})).order_status,'Collected');
  const receipt=first.body.payments.find((p)=>p.order_id===o.order_id);
  await command({payment:{...receipt,payment_status:'Pending'}}).expect(200);
  await command({payment:{...receipt,payment_status:'Paid'}}).expect(409);
});
test('Invalid combined payment rolls back order update; concurrent payments cannot overpay',async()=>{
  const c=await customer();const o=await order(c.customer_id);
  const payment={order_id:o.order_id,amount_paid:40,payment_status:'Paid',payment_method:'Cash',payment_date:'2031-11-09 12:00',reference_number:null};
  await command({order:{order_id:o.order_id,_version:o._version,order_status:'Collected'},payment}).expect(409);
  assert.equal((await db.collection('orders').findOne({order_id:o.order_id})).order_status,'Pending');
  const results=await Promise.all([command({payment:{...payment,amount_paid:20}}),command({payment:{...payment,amount_paid:20}})]);
  assert.deepEqual(results.map((result)=>result.status).sort(),[200,409]);assert.equal(await db.collection('payments').countDocuments({order_id:o.order_id}),1);
});
test('Reports use payment dates separately from order dates, with pagination',async()=>{
  const c=await customer();const o=await order(c.customer_id);
  await command({payment:{order_id:o.order_id,amount_paid:35,payment_status:'Paid',payment_method:'Cash',payment_date:'2031-12-02T12:00:00+08:00'}}).expect(200);
  const report=await agent.get('/api/reports/overview').query({from:'2031-12-01T00:00:00+08:00',to:'2032-01-01T00:00:00+08:00'}).expect(200);
  assert.equal(report.body.orders.count,0);assert.equal(report.body.payments.payments_collected,35);
  const paged=await agent.get('/api/orders').query({limit:1,page:2}).expect(200);assert.equal(paged.body.data.length,1);assert.ok(paged.body.total>1);
});
