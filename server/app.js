'use strict';
const express=require('express');
const helmet=require('helmet');
const {rateLimit}=require('express-rate-limit');
const {randomBytes,createHash}=require('node:crypto');
const path=require('node:path');
const {AppError,fail,id,date,clean}=require('./domain');
const {hashPassword,verifyPassword}=require('./database');
const {snapshot,command,saveCustomer,deleteCustomer}=require('./service');
const root=path.resolve(__dirname,'..');
const tokenHash=(token)=>createHash('sha256').update(token).digest('hex');
async function createApp({client,db,origin='http://localhost:3000',secure=false}) {
  const app=express();app.disable('x-powered-by');app.use(helmet());app.use(express.json({limit:'32kb'}));
  app.use((req,res,next)=>{if(req.path.startsWith('/api/')&&!['GET','HEAD','OPTIONS'].includes(req.method)&&(!req.body||typeof req.body!=='object'||Array.isArray(req.body)))return res.status(400).json({error:'Provide a JSON object.'});next();});
  app.use((req,res,next)=>{res.setHeader('Cache-Control','no-store');if(!['GET','HEAD','OPTIONS'].includes(req.method)&&req.get('origin')!==origin)return res.status(403).json({error:'Request origin is not allowed.'});next();});
  const cookie={httpOnly:true,sameSite:'strict',secure,path:'/',maxAge:8*3600000};
  async function session(req,res,next) {
    const token=(req.headers.cookie||'').split(';').map((value)=>value.trim()).find((value)=>value.startsWith('bubblewash_session='))?.slice('bubblewash_session='.length);
    if(token&&/^[a-f0-9]{64}$/.test(token)) {
      const record=await db.collection('sessions').findOne({token_hash:tokenHash(token),expires_at:{$gt:new Date()}});
      if(record) {req.sessionHash=record.token_hash;req.user=await db.collection('users').findOne({user_id:record.user_id,account_status:'Active',role:{$in:['Admin','Staff']}});}
    }
    next();
  }
  app.use(session);
  const dummy=await hashPassword(randomBytes(32).toString('hex'));
  app.get('/api/health',async(req,res)=>{await db.command({ping:1});res.json({ok:true});});
  app.post('/api/auth/login',rateLimit({windowMs:15*60000,limit:15,standardHeaders:'draft-7',legacyHeaders:false,handler:(req,res)=>res.status(429).json({error:'Too many sign-in attempts. Try again in 15 minutes.'})}),async(req,res)=>{
    const {username,password}=req.body;
    if(typeof username!=='string'||typeof password!=='string'||username.length>30||password.length>128)fail('Invalid username or password.',401);
    const user=await db.collection('users').findOne({username});
    const valid=await verifyPassword(password,user?.password_hash||dummy);
    if(!valid||!user||user.account_status!=='Active'||!['Admin','Staff'].includes(user.role))fail('Invalid username or password.',401);
    if(req.sessionHash)await db.collection('sessions').deleteOne({token_hash:req.sessionHash});
    const token=randomBytes(32).toString('hex');await db.collection('sessions').insertOne({token_hash:tokenHash(token),user_id:user.user_id,expires_at:new Date(Date.now()+cookie.maxAge)});
    res.cookie('bubblewash_session',token,cookie).json({user:clean(user)});
  });
  app.use('/api',(req,res,next)=>{if(!req.user)return res.status(401).json({error:'Sign in to continue.'});next();});
  app.get('/api/auth/me',(req,res)=>res.json({user:clean(req.user)}));
  app.post('/api/auth/logout',async(req,res)=>{if(req.sessionHash)await db.collection('sessions').deleteOne({token_hash:req.sessionHash});res.clearCookie('bubblewash_session',{path:'/',httpOnly:true,sameSite:'strict',secure}).json({ok:true});});
  app.get('/api/bootstrap',async(req,res)=>res.json(await snapshot(db,req.user)));
  app.post('/api/commands',async(req,res)=>res.json(await command(client,db,req.user,req.body,req.get('idempotency-key'))));
  app.post('/api/customers',async(req,res)=>res.status(201).json(await saveCustomer(client,db,req.body,null,{key:req.get('idempotency-key'),userId:req.user.user_id})));
  app.patch('/api/customers/:id',async(req,res)=>res.json(await saveCustomer(client,db,req.body,id(Number(req.params.id)))));
  app.delete('/api/customers/:id',async(req,res)=>{await deleteCustomer(client,db,id(Number(req.params.id)),id(req.body._version,'Version'));res.json({ok:true});});
  function filter(req,field) {
    const match={};
    if(req.query.from||req.query.to) {
      match[field]={};if(req.query.from)match[field].$gte=date(req.query.from,'From');if(req.query.to)match[field].$lt=date(req.query.to,'To');
      if(match[field].$gte&&match[field].$lt&&match[field].$gte>=match[field].$lt)fail('From must precede To.');
    }
    return match;
  }
  for(const [name,field] of [['customers','created_at'],['orders','order_date'],['payments','payment_date'],['services',null]])app.get('/api/'+name,async(req,res)=>{
    const match=field?filter(req,field):{};
    if(req.query.customer_id&&name==='orders')match.customer_id=id(Number(req.query.customer_id));
    if(req.query.order_id&&name==='payments')match.order_id=id(Number(req.query.order_id));
    if(req.query.q) {
      if(typeof req.query.q!=='string'||req.query.q.length>100)fail('Search is too long.');
      const regex=new RegExp(req.query.q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i');
      match.$or=(name==='customers'?['first_name','last_name','contact_number']:name==='orders'?['order_number']:name==='services'?['service_name']:['reference_number','payment_method']).map((key)=>({[key]:regex}));
      if(name==='customers')match.$or.push({$expr:{$regexMatch:{input:{$concat:['$first_name',' ','$last_name']},regex}}});
    }
    const page=Number(req.query.page||1),limit=Number(req.query.limit||25);
    if(!Number.isInteger(page)||page<1||page>100000||!Number.isInteger(limit)||limit<1||limit>100)fail('Use page ≥ 1 and limit 1–100.');
    const total=await db.collection(name).countDocuments(match);
    const data=await db.collection(name).find(match).sort(field?{[field]:-1,_id:-1}:{service_id:1}).skip((page-1)*limit).limit(limit).toArray();
    res.json({data:clean(data),total,page,limit});
  });
  app.get('/api/reports/overview',async(req,res)=>{
    const orders=await db.collection('orders').aggregate([{$match:filter(req,'order_date')},{$group:{_id:null,count:{$sum:1},net_order_value:{$sum:'$total_amount'},weight:{$sum:'$weight'}}}]).toArray();
    const payments=await db.collection('payments').aggregate([{$match:{...filter(req,'payment_date'),payment_status:'Paid'}},{$group:{_id:null,count:{$sum:1},payments_collected:{$sum:'$amount_paid'}}}]).toArray();
    res.json({orders:clean(orders[0]||{count:0,net_order_value:0,weight:0}),payments:clean(payments[0]||{count:0,payments_collected:0}),timeZone:'Asia/Manila'});
  });
  app.use('/api',(req,res)=>res.status(404).json({error:'API endpoint not found.'}));
  app.get('/js/runtime-config.js',(req,res)=>res.type('application/javascript').send('window.LAUNDRY_BACKEND_MODE = true;'));
  app.get('/login',(req,res)=>res.sendFile(path.join(__dirname,'public','login.html')));
  app.get('/auth/login.js',(req,res)=>res.sendFile(path.join(__dirname,'public','login.js')));
  app.get(['/','/index.html'],(req,res)=>req.user?res.sendFile(path.join(root,'index.html')):res.redirect('/login'));
  for(const folder of ['css','js','assets'])app.use('/'+folder,express.static(path.join(root,folder),{dotfiles:'deny',index:false}));
  app.use((req,res)=>res.status(404).type('text').send('Not found'));
  app.use((error,req,res,next)=>{
    if(error instanceof AppError)return res.status(error.status).json({error:error.message});
    if(error.type==='entity.parse.failed')return res.status(400).json({error:'Invalid JSON.'});
    if(error.code===11000)return res.status(409).json({error:'A record with this identifier already exists. Reload and retry.'});
    console.error('Backend request failed:',error.name);res.status(500).json({error:'The server could not complete this request. Please retry.'});
  });
  return app;
}
module.exports={createApp};
