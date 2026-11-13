'use strict';
const { Decimal128 } = require('mongodb');
class AppError extends Error { constructor(status,message) { super(message); this.status=status; } }
const fail=(message,status=400)=>{throw new AppError(status,message);};
function text(value,name,max,optional=false) {
  if (optional && (value===null || value===undefined || value==='')) return null;
  if (typeof value!=='string' || !value.trim() || value.trim().length>max) fail(`${name} must contain 1–${max} characters.`);
  return value.trim();
}
function id(value,name='ID') { if(!Number.isInteger(value)||value<1||value>2147483647)fail(`${name} must be a positive integer.`);return value; }
function cents(value,name='Amount') {
  if(!['string','number'].includes(typeof value)||!/^\d+(\.\d{1,2})?$/.test(String(value))||!Number.isFinite(Number(value))||Number(value)>99999999.99)fail(`${name} must be from 0 to 99,999,999.99 with at most two decimals.`);
  return Math.round(Number(value)*100);
}
const decimal=(amount)=>Decimal128.fromString((amount/100).toFixed(2));
const storedCents=(value)=>Math.round(Number(value?.toString() ?? 0)*100);
function date(value,name,optional=false) {
  if(optional && !value)return null;
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(value))fail(`${name} must be a date and time.`);
  const normalized=value.replace(' ','T');
  const [year,month,day]=normalized.slice(0,10).split('-').map(Number);
  const calendar=new Date(Date.UTC(year,month-1,day));
  if(year<1000||calendar.getUTCFullYear()!==year||calendar.getUTCMonth()!==month-1||calendar.getUTCDate()!==day||Number(normalized.slice(11,13))>23||Number(normalized.slice(14,16))>59)fail(`${name} is invalid.`);
  const d=new Date(/[Zz]$|[+-]\d{2}:\d{2}$/.test(normalized)?normalized:normalized+'+08:00');
  if(Number.isNaN(d.getTime()))fail(`${name} is invalid.`);return d;
}
function customer(body) {return {first_name:text(body.first_name,'First name',30),last_name:text(body.last_name,'Last name',30),contact_number:text(body.contact_number,'Contact number',30,true)};}
function clean(value) {
  if(value instanceof Date)return value.toISOString();
  if(value instanceof Decimal128)return Number(value.toString());
  if(Array.isArray(value))return value.map(clean);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!['_id','password_hash'].includes(key)).map(([key,v])=>[key,clean(v)]));
  return value;
}
module.exports={AppError,fail,text,id,cents,decimal,storedCents,date,customer,clean};
