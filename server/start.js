'use strict';
require('dotenv').config({quiet:true});
const {MongoClient}=require('mongodb');
const {initialize,provision}=require('./database');
const {createApp}=require('./app');
async function main() {
  if(!process.env.MONGODB_URI)throw new Error('Create .env from .env.example and set MONGODB_URI.');
  const port=Number(process.env.PORT||3000),host=process.env.HOST||'127.0.0.1';
  const dbName=process.env.MONGODB_DB||'bubblewash_development';
  if(!/^[a-zA-Z0-9_-]+$/.test(dbName))throw new Error('Use a simple MONGODB_DB name.');
  const client=new MongoClient(process.env.MONGODB_URI,{serverSelectionTimeoutMS:10000});
  try {
    await client.connect();
    const hello=await client.db('admin').command({hello:1});
    if(!hello.setName&&hello.msg!=='isdbgrid')throw new Error('Use MongoDB Atlas or a replica set; atomic order/payment saves require transactions.');
    const db=client.db(dbName);await initialize(db);
    if(process.argv.includes('--setup')) {
      await provision(db,{username:process.env.BOOTSTRAP_USERNAME,password:process.env.BOOTSTRAP_PASSWORD});
      console.log('Setup complete: admin and three starter services are ready. Existing passwords and service prices were preserved.');await client.close();return;
    }
    const app=await createApp({client,db,origin:process.env.PUBLIC_ORIGIN||`http://localhost:${port}`,secure:process.env.NODE_ENV==='production'});
    const server=app.listen(port,host,()=>console.log(`BubbleWash: ${process.env.PUBLIC_ORIGIN||`http://localhost:${port}`} (MongoDB mode)`));
    for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(async()=>{await client.close();process.exit(0);}));
  }catch(error){await client.close();throw error;}
}
main().catch((error)=>{console.error(error.name==='MongoServerSelectionError'?'Cannot reach MongoDB. Check your URI, Atlas network access and database user.':error.message);process.exitCode=1;});
