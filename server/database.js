'use strict';
const {randomBytes,scrypt:derive,timingSafeEqual}=require('node:crypto');
const {promisify}=require('node:util');
const {decimal,fail,text}=require('./domain');
const scrypt=promisify(derive);
async function hashPassword(password) {const salt=randomBytes(16).toString('hex');const hash=await scrypt(password,salt,64);return salt+':'+hash.toString('hex');}
async function verifyPassword(password,stored) {const [salt,hex]=stored.split(':');const result=await scrypt(password,salt,64);const expected=Buffer.from(hex,'hex');return result.length===expected.length&&timingSafeEqual(result,expected);}
async function nextId(db,name,session) {const record=await db.collection('counters').findOneAndUpdate({_id:name},{$inc:{value:1}},{upsert:true,returnDocument:'after',session});return record.value;}
async function initialize(db) {
  const existing=await db.listCollections({}, {nameOnly:true}).toArray();
  const marker=existing.some((collection)=>collection.name==='app_metadata')?await db.collection('app_metadata').findOne({_id:'schema'}):null;
  if(marker&&(marker.app!=='bubblewash'||marker.version!==1))fail('This database uses a different application/schema. Choose a new development database.',409);
  if(!marker) {
    for(const name of ['customers','orders','payments','users','services'])if(existing.some((collection)=>collection.name===name)&&await db.collection(name).countDocuments({})>0)fail('Use a new, empty database name for BubbleWash. Existing collections were not modified.',409);
  }
  const required={customers:['customer_id','first_name','last_name','created_at'],services:['service_id','service_name','unit_price','pricing_unit','service_status'],orders:['order_id','order_number','customer_id','service_id','created_by','order_date','subtotal','discount','total_amount','order_status'],payments:['payment_id','order_id','received_by','payment_date','amount_paid','payment_method','payment_status'],users:['user_id','username','password_hash','role','account_status']};
  for(const [name,fields] of Object.entries(required)) {
    if(!existing.some((collection)=>collection.name===name)) await db.createCollection(name,{validator:{$jsonSchema:{bsonType:'object',required:fields}},validationLevel:'strict'});
  }
  for(const [name,key] of [['customers','customer_id'],['services','service_id'],['orders','order_id'],['orders','order_number'],['payments','payment_id'],['users','user_id'],['users','username']]) await db.collection(name).createIndex({[key]:1},{unique:true});
  await db.collection('orders').createIndex({customer_id:1,order_date:-1});
  await db.collection('payments').createIndex({order_id:1,payment_date:-1});
  await db.collection('sessions').createIndex({expires_at:1},{expireAfterSeconds:0});
  await db.collection('sessions').createIndex({token_hash:1},{unique:true});
  await db.collection('operations').createIndex({user_id:1,key:1},{unique:true});
  await db.collection('app_metadata').updateOne({_id:'schema'},{$setOnInsert:{app:'bubblewash',version:1,created_at:new Date()}},{upsert:true});
}
async function provision(db,{username,password}) {
  text(username,'Admin username',30);
  if(typeof password!=='string'||password.length<12||password.length>128)fail('Set BOOTSTRAP_PASSWORD to 12–128 characters.');
  const existing=await db.collection('users').findOne({username});
  if(!existing) await db.collection('users').insertOne({user_id:await nextId(db,'users'),first_name:'Workspace',last_name:'Admin',username,password_hash:await hashPassword(password),role:'Admin',account_status:'Active',created_at:new Date()});
  const services=[['Wash & Fold',35,'per kg'],['Dry Cleaning',75,'per kg'],['Heavy Bedding',150,'per load']];
  for(const [service_name,price,pricing_unit] of services) {
    if(!await db.collection('services').findOne({service_name})) await db.collection('services').insertOne({service_id:await nextId(db,'services'),service_name,description:null,pricing_unit,unit_price:decimal(price*100),service_status:'Active'});
  }
}
module.exports={initialize,provision,nextId,hashPassword,verifyPassword};
