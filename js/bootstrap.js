(async function () {
  'use strict';
  const scriptNames=['dates','customer-combobox','mock-data','app','workspace','order-views','payment-editor','overview','transactions'];
  const pendingKeys=new Map();
  async function request(url,{method='GET',body}={}) {
    const headers={'Content-Type':'application/json'};
    let fingerprint;
    if(url==='/api/commands'||(url==='/api/customers'&&method==='POST')) {fingerprint=url+JSON.stringify(body);if(!pendingKeys.has(fingerprint))pendingKeys.set(fingerprint,crypto.randomUUID());headers['Idempotency-Key']=pendingKeys.get(fingerprint);}
    let response;
    try {response=await fetch(url,{method,credentials:'same-origin',headers,body:body===undefined?undefined:JSON.stringify(body)});}
    catch(error){throw new Error('Cannot reach the server. Your changes were not confirmed; reconnect and retry.');}
    const result=await response.json();
    if(!response.ok) {if(response.status===401)location.replace('/login');const error=new Error(result.error||'The request failed.');error.status=response.status;throw error;}
    if(fingerprint)pendingKeys.delete(fingerprint);return result;
  }
  window.LaundryPersistence={withBusy:async(form,save)=>{if(form.dataset.saving)return false;form.dataset.saving='true';const button=form.querySelector('button[type="submit"]');if(button)button.disabled=true;try{return await save();}finally{delete form.dataset.saving;if(button)button.disabled=false;}}};
  try {
    if(window.LAUNDRY_BACKEND_MODE) {
      const data=await request('/api/bootstrap');
      window.LaundryBackend={data,request};
      document.querySelector('.workspace-context .demo-caption').textContent='Connected to shared records';
    }
    for(const name of scriptNames)await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=`./js/${name}.js`;script.onload=resolve;script.onerror=()=>reject(new Error('A workspace file could not be loaded. Refresh to retry.'));document.head.append(script);});
    if(window.LaundryBackend) {
      document.querySelectorAll('.demo-caption').forEach((element)=>{element.textContent='Shared MongoDB records';});
      document.querySelector('.workspace-context .demo-caption').textContent=`Signed in as ${window.LaundryBackend.data.user.username}`;
      const logout=document.createElement('button');logout.type='button';logout.className='text-button';logout.textContent='Sign out';logout.addEventListener('click',async()=>{try{await request('/api/auth/logout',{method:'POST',body:{}});location.replace('/login');}catch(error){window.LaundryApp.showToast(error.message);}});document.querySelector('.workspace-context').append(logout);
      document.getElementById('orderDemoNote').textContent='Create an order in the shared database. Payment is recorded separately.';
      document.getElementById('paymentHelp').textContent='Record or correct a payment received. This updates shared records; it does not charge the customer.';
    }
  }catch(error) {
    const main=document.querySelector('main');main.replaceChildren();const message=document.createElement('p');message.setAttribute('role','alert');message.textContent=error.message;const retry=document.createElement('button');retry.type='button';retry.className='primary-button';retry.textContent='Reload workspace';retry.addEventListener('click',()=>location.reload());main.append(message,retry);
  }
})();
