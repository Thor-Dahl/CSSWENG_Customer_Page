(function () {
  'use strict';
  const workspace=window.LaundryWorkspace;
  const dates=window.LaundryDates;
  const $=(id)=>document.getElementById(id);
  const escape=workspace.escape;
  let editingId=null;
  document.body.insertAdjacentHTML('beforeend', `<div class="modal-overlay hidden" id="paymentOverlay"><section class="modal order-modal" role="dialog" aria-modal="true" aria-labelledby="paymentFormTitle" aria-describedby="paymentHelp">
    <header class="modal-header"><div><span class="eyebrow">PAYMENT RECORD</span><h2 id="paymentFormTitle">Record payment</h2></div><button type="button" class="icon-button" data-payment-close aria-label="Close payment editor">${workspace.icon('x')}</button></header>
    <p class="dialog-description" id="paymentHelp">Record or correct a payment received. This updates the local demo ledger; it does not charge a customer or change laundry progress.</p>
    <form id="paymentForm" novalidate><div class="form-grid">
      <label class="form-field full-width">Order<select id="paymentOrder" required aria-describedby="paymentError"></select></label>
      <p class="payment-balance full-width" id="paymentBalance"></p>
      <label class="form-field">Amount (PHP)<input type="number" id="paymentAmount" min="0.01" max="99999999.99" step="0.01" required aria-describedby="paymentError"></label>
      <label class="form-field">Payment date<input type="datetime-local" id="paymentDate" required aria-describedby="paymentError"></label>
      <label class="form-field">Method<select id="paymentMethod"><option>Cash</option><option>GCash</option><option>Card</option><option>Bank transfer</option></select></label>
      <label class="form-field">Payment status<select id="paymentStatus"><option value="Paid">Paid</option><option value="Pending">Pending</option></select></label>
      <label class="form-field full-width">Reference number (optional)<input id="paymentReference" maxlength="30" aria-describedby="paymentError"></label>
    </div><p class="form-error hidden" role="alert" id="paymentError"></p><div class="modal-actions"><button type="button" class="secondary-button" data-payment-close>Cancel</button><button type="submit" class="primary-button" id="savePaymentButton">Record payment</button></div></form>
  </section></div>`);
  function balance() {
    const order=workspace.getOrders().find((item)=>item.order_id===Number($('paymentOrder').value));
    const received=workspace.getPayments().filter((payment)=>payment.order_id===order?.order_id && payment.payment_id!==editingId && payment.payment_status==='Paid').reduce((sum,payment)=>sum+Math.round(Number(payment.amount_paid)*100),0);
    const due=order ? Math.max(0,Math.round(Number(order.total_amount)*100)-received)/100 : 0;
    $('paymentBalance').textContent=order ? `Order total: ${workspace.money(order.total_amount)}. Available to record as paid: ${workspace.money(due)}.` : 'Choose the order this payment belongs to.';
    return {order,due};
  }
  workspace.openPayment=({paymentId=null,orderId=null}={})=>{
    const payment=workspace.getPayments().find((item)=>item.payment_id===paymentId);
    editingId=payment?.payment_id ?? null;
    $('paymentForm').reset();
    $('paymentOrder').innerHTML='<option value="">Choose an order</option>'+workspace.getOrders().map((order)=>`<option value="${order.order_id}">${escape(`${workspace.getCustomerName(order.customer_id)} - ${workspace.getService(order.service_id).service_name} - ${dates.format(order.order_date,true)} - ${workspace.money(order.total_amount)} (${order.order_number})`)}</option>`).join('');
    $('paymentOrder').value=payment?.order_id ?? orderId ?? '';
    $('paymentOrder').disabled=!!payment;
    for (const [id,value] of [['paymentMethod',payment?.payment_method || 'Cash'],['paymentStatus',payment?.payment_status || 'Paid']]) {
      if (![...$(id).options].some((option)=>option.value===value)) $(id).add(new Option(value,value));
      $(id).value=value;
    }
    $('paymentDate').value=dates.input(payment?.payment_date || new Date());
    $('paymentReference').value=payment?.reference_number || '';
    const {due}=balance();
    $('paymentAmount').value=payment?.amount_paid ?? (orderId ? due.toFixed(2) : '');
    $('paymentError').classList.add('hidden');
    $('paymentForm').querySelectorAll('[aria-invalid]').forEach((field)=>field.removeAttribute('aria-invalid'));
    $('paymentFormTitle').textContent=payment ? 'Edit payment' : 'Record payment';
    $('savePaymentButton').textContent=payment ? 'Save changes' : 'Record payment';
    workspace.openDialog('paymentOverlay');
  };
  function error(message,id) {
    $('paymentError').textContent=message;$('paymentError').classList.remove('hidden');
    if (id) {$(id).setAttribute('aria-invalid','true');$(id).focus();}
  }
  $('paymentOrder').addEventListener('change',()=>{const {due}=balance();$('paymentAmount').value=due.toFixed(2);});
  $('paymentForm').addEventListener('submit',async(event)=>{
    event.preventDefault();
    const {order,due}=balance();
    const amount=Number($('paymentAmount').value);
    if (!order) return error('Choose an existing order.','paymentOrder');
    if (!$('paymentAmount').value || !$('paymentAmount').validity.valid || !Number.isFinite(amount) || amount<=0) return error('Enter an amount from 0.01 to 99,999,999.99, with up to two decimal places.','paymentAmount');
    if (!$('paymentDate').value || !$('paymentDate').validity.valid) return error('Enter a valid payment date and time.','paymentDate');
    if ($('paymentStatus').value==='Paid' && Math.round(amount*100)>Math.round(due*100)) return error('The paid amount exceeds the remaining order balance. Correct the amount or the existing payment first.','paymentAmount');
    const existing=workspace.getPayments().find((payment)=>payment.payment_id===editingId);
    if ($('paymentReference').value.length > 30) return error('Reference number must be at most 30 characters.','paymentReference');
    const record={payment_id:editingId ?? Math.max(0,...workspace.getPayments().map((payment)=>payment.payment_id))+1,order_id:order.order_id,received_by:existing?.received_by ?? workspace.currentUser.user_id,payment_date:$('paymentDate').value.replace('T',' '),amount_paid:Math.round(amount*100)/100,payment_method:$('paymentMethod').value,payment_status:$('paymentStatus').value,reference_number:$('paymentReference').value.trim() || null};
    const next=editingId ? workspace.getPayments().map((payment)=>payment.payment_id===editingId ? record : payment) : [record,...workspace.getPayments()];
    if (!await window.LaundryPersistence.withBusy($('paymentForm'),()=>workspace.savePayments(next))) return error(workspace.lastError() || 'Payment was not saved. Allow browser storage and try again.');
    workspace.closeDialog('paymentOverlay');workspace.showToast(editingId ? 'Payment updated.' : 'Payment recorded.');
  });
  document.querySelectorAll('[data-payment-close]').forEach((button)=>button.addEventListener('click',()=>workspace.closeDialog('paymentOverlay')));
  $('paymentOverlay').addEventListener('click',(event)=>{if(event.target===$('paymentOverlay'))workspace.closeDialog('paymentOverlay');});
  document.addEventListener('click',(event)=>{const button=event.target.closest('[data-edit-payment]');if(button)workspace.openPayment({paymentId:Number(button.dataset.editPayment)});});
})();
