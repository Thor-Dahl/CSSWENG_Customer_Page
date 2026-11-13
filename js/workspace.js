(function () {
  'use strict';

  const app = window.LaundryApp;
  const $ = (id) => document.getElementById(id);
  const STORAGE_KEY = 'laundry-orders-ui-v2';
  const online=window.LaundryBackend;
  let persistenceError='';
  let savedLedger = null;
  try { if(!online) savedLedger = JSON.parse(localStorage.getItem('laundry-ledger-ui-v1') || 'null'); } catch (error) { /* Older independent records remain available. */ }
  const currentUser = online?.data.user || { user_id: 101, first_name: 'Juan', last_name: 'Cruz', role: 'Staff', account_status: 'Active' };
  const statuses = ['Pending', 'In Progress', 'Ready for Pickup', 'Collected'];
  const services = online ? Object.fromEntries(online.data.services.map((service)=>[service.service_id,service])) : {
    1: { service_id: 1, service_status: 'Active', description: null, service_name: 'Wash & Fold', unit_price: 35, pricing_unit: 'per kg' },
    2: { service_id: 2, service_status: 'Active', description: null, service_name: 'Dry Cleaning', unit_price: 75, pricing_unit: 'per kg' },
    3: { service_id: 3, service_status: 'Active', description: null, service_name: 'Heavy Bedding', unit_price: 150, pricing_unit: 'per load' }
  };
  const seedCustomers = online ? [] : [
    { id: 1, firstName: 'Maria', lastName: 'Santos', phone: '0917-111-2233',  orders: 2, totalSpent: 377.5, created_at: '2026-11-09 08:00', isSample: true },
    { id: 2, firstName: 'Juan', lastName: 'Dela Cruz', phone: '0918-222-3344',  orders: 2, totalSpent: 450, created_at: '2026-11-09 08:00', isSample: true },
    { id: 3, firstName: 'Alex', lastName: 'Rivera', phone: '0999-000-0000',  orders: 0, totalSpent: 0, created_at: '2026-11-09 08:00', isSample: true }
  ];
  const seedOrders = [
    { order_id: 1, order_number: 'ORD-2026-001', customer_id: 1, service_id: 1, created_by: 101, order_date: '2026-11-09 08:30', weight: 6.5, subtotal: 227.5, discount: 0, total_amount: 227.5, order_status: 'Pending', estimated_completion: '2026-11-10 17:00' },
    { order_id: 2, order_number: 'ORD-2026-002', customer_id: 2, service_id: 2, created_by: 101, order_date: '2026-11-09 10:15', weight: 3, subtotal: 225, discount: 25, total_amount: 200, order_status: 'In Progress', estimated_completion: '2026-11-11 12:00' },
    { order_id: 3, order_number: 'ORD-2026-003', customer_id: 1, service_id: 3, created_by: 101, order_date: '2026-11-08 14:00', weight: 1, subtotal: 150, discount: 0, total_amount: 150, order_status: 'Ready for Pickup', estimated_completion: '2026-11-09 16:00' },
    { order_id: 4, order_number: 'ORD-2026-004', customer_id: 2, service_id: 1, created_by: 101, order_date: '2026-11-07 09:00', weight: 8, subtotal: 280, discount: 30, total_amount: 250, order_status: 'Collected', estimated_completion: '2026-11-08 11:00' }
  ];
  let payments = online?.data.payments || [
    { payment_id: 1001, order_id: 1, received_by: 101, payment_date: '2026-11-09 08:35', amount_paid: 227.5, payment_method: 'Cash', payment_status: 'Paid', reference_number: 'CASH-REC-001' },
    { payment_id: 1002, order_id: 3, received_by: 101, payment_date: '2026-11-08 14:05', amount_paid: 150, payment_method: 'GCash', payment_status: 'Paid', reference_number: 'GCASH-99881123' },
    { payment_id: 1003, order_id: 4, received_by: 101, payment_date: '2026-11-07 09:10', amount_paid: 250, payment_method: 'Cash', payment_status: 'Paid', reference_number: 'CASH-REC-004' }
  ];
  try {
    const savedPayments = online?.data.payments || savedLedger?.payments || JSON.parse(localStorage.getItem('laundry-payments-ui-v1') || 'null');
    if (Array.isArray(savedPayments) && savedPayments.every((payment) => Number.isInteger(payment.payment_id) && Number.isInteger(payment.order_id) && Number.isFinite(payment.amount_paid))) payments = savedPayments;
  } catch (error) { app.showToast('Saved payment records could not be loaded.'); }
  const dialogStack = [];
  let activeDialog = null;
  let suspendedDialog = null;
  let orders = online?.data.orders || seedOrders.map((order) => ({ ...order }));
  try {
    const saved = (online ? online.data.orders : savedLedger?.orders || JSON.parse(localStorage.getItem(STORAGE_KEY) || localStorage.getItem('laundry-orders-ui-v1') || 'null'))?.map(({ loads, ...order }) => ({ ...order, customer_id: app.resolveCustomerId(order.customer_id), created_by: order.created_by || currentUser.user_id, estimated_completion: order.estimated_completion || null }));
    if (Array.isArray(saved) && saved.length >= seedOrders.length && saved.every((order) =>
      Number.isInteger(order.order_id) && typeof order.order_number === 'string' && Number.isInteger(order.customer_id) &&
      services[order.service_id] && statuses.includes(order.order_status) && Number.isFinite(order.total_amount) && order.total_amount >= 0 &&
      (order.weight === null || Number.isFinite(order.weight)) && typeof order.order_date === 'string'
    ) && new Set(saved.map((order) => order.order_id)).size === saved.length) orders = saved;
  } catch (error) { app.showToast('Saved orders could not be loaded. Showing sample orders.'); }

  const subscribers = new Set();
  let returnFocus = null;
  let returnFocusSelector = null;
  let editedOrder = null;
  let deleteAction = null;
  let confirmationFocus = null;
  const money = (value) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value);
  const customerName = (id) => {
    const customer = app.getCustomers().find((item) => item.id === Number(id));
    return customer ? `${customer.firstName} ${customer.lastName}` : 'Removed customer';
  };
  function notify() {
    app.refresh();
    subscribers.forEach((callback) => callback());
  }
  async function persistLedger(nextOrders, nextPayments) {
    persistenceError='';
    if(online) {
      try {
        const changedOrder=nextOrders.find((record)=>JSON.stringify(record)!==JSON.stringify(orders.find((old)=>old.order_id===record.order_id)));
        const changedPayment=nextPayments.find((record)=>JSON.stringify(record)!==JSON.stringify(payments.find((old)=>old.payment_id===record.payment_id)));
        const body={};
        if(changedOrder) {
          const existing=orders.find((record)=>record.order_id===changedOrder.order_id);
          body.order=existing?{order_id:existing.order_id,_version:existing._version,order_status:changedOrder.order_status,estimated_completion:changedOrder.estimated_completion}:{customer_id:changedOrder.customer_id,service_id:changedOrder.service_id,weight:changedOrder.weight,loads:changedOrder.loads,discount:changedOrder.discount,order_date:changedOrder.order_date,estimated_completion:changedOrder.estimated_completion};
        }
        if(changedPayment) {
          const existing=payments.find((record)=>record.payment_id===changedPayment.payment_id);
          body.payment={...changedPayment,payment_id:existing?.payment_id,_version:existing?._version};
          delete body.payment.received_by;
        }
        if(!body.order&&!body.payment)return true;
        const data=await online.request('/api/commands',{method:'POST',body});
        online.data=data;orders=data.orders;payments=data.payments;notify();return true;
      }catch(error){persistenceError=error.message;return false;}
    }
    try { localStorage.setItem('laundry-ledger-ui-v1', JSON.stringify({ orders: nextOrders, payments: nextPayments })); }
    catch (error) { return false; }
    orders = nextOrders; payments = nextPayments;
    notify();
    return true;
  }
  function persist(next) { return persistLedger(next, payments); }
  function localDate(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
    const part = (type) => parts.find((item) => item.type === type).value;
    return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
  }
  function openDialog(id) {
    const trigger = document.activeElement;
    const visible = document.querySelector('.modal-overlay:not(.hidden)');
    dialogStack.push({ returnFocus, returnFocusSelector, activeDialog, suspendedDialog });
    suspendedDialog = visible?.id || null;
    if (visible) visible.classList.add('hidden');
    activeDialog = id;
    returnFocus = trigger;
    returnFocusSelector = returnFocus?.id ? `#${CSS.escape(returnFocus.id)}` :
      returnFocus?.dataset.updateOrder ? `[data-update-order="${CSS.escape(returnFocus.dataset.updateOrder)}"]` : returnFocus?.dataset.editPayment ? `[data-edit-payment="${CSS.escape(returnFocus.dataset.editPayment)}"]` : returnFocus?.dataset.recordPayment ? `[data-record-payment="${CSS.escape(returnFocus.dataset.recordPayment)}"]` : returnFocus?.dataset.viewOrder ? `[data-view-order="${CSS.escape(returnFocus.dataset.viewOrder)}"]` : null;
    $(id).classList.remove('hidden');
    $('app').inert = true;
    document.body.classList.add('dialog-open');
    $(id).querySelector('input, select, button').focus();
  }
  function closeDialog(id) {
    $(id).classList.add('hidden');
    if (suspendedDialog) $(suspendedDialog)?.classList.remove('hidden');
    const anyOpen = !!document.querySelector('.modal-overlay:not(.hidden)');
    $('app').inert = anyOpen;
    document.body.classList.toggle('dialog-open', anyOpen);
    if (returnFocus?.isConnected) returnFocus.focus();
    else {
      const scope = suspendedDialog ? $(suspendedDialog) : document.querySelector('.workspace-page:not(.hidden)') || $('customerPage');
      const fallback = (returnFocusSelector && scope?.querySelector(returnFocusSelector)) || scope?.querySelector('input[type="search"]') || scope?.querySelector('input, button:not([disabled]), select');
      fallback?.focus();
    }
    const previous = dialogStack.pop();
    if (previous) ({ returnFocus, returnFocusSelector, activeDialog, suspendedDialog } = previous);
  }
  function openCreateOrder() {
    $('orderForm').reset();
    $('orderCustomer').innerHTML = '<option value="">Select a customer</option>' + app.getCustomers().map((customer) =>
      `<option value="${app.escape(customer.id)}">${app.escape(`${customer.firstName} ${customer.lastName}${customer.phone ? ' - ' + customer.phone : ''}`)}</option>`).join('');
    window.LaundryCustomerCombobox.enhanceSelect($('orderCustomer'));
    $('orderDate').value = localDate();
    $('orderCompletion').value = '';
    $('orderError').classList.add('hidden');
    $('orderForm').querySelectorAll('[aria-invalid]').forEach((field) => field.removeAttribute('aria-invalid'));
    calculate();
    openDialog('orderOverlay');
  }
  function calculate() {
    const service = services[$('orderService').value];
    const weight = $('orderWeight').value === '' ? null : Number($('orderWeight').value);
    const loads = Number($('orderLoads').value);
    $('orderLoadsField').classList.toggle('hidden', service.pricing_unit !== 'per load');
    $('orderWeight').required = service.pricing_unit === 'per kg';
    const subtotal = Math.round(service.unit_price * (service.pricing_unit === 'per load' ? loads : weight) * 100) / 100;
    const discount = Number($('orderDiscount').value);
    $('orderSubtotal').textContent = money(Number.isFinite(subtotal) ? subtotal : 0);
    $('orderTotal').textContent = money(Number.isFinite(subtotal - discount) ? Math.max(0, subtotal - discount) : 0);
    $('orderWeight').closest('label').firstChild.textContent = `Weight (kg)${service.pricing_unit === 'per kg' ? ' *' : ' (optional)'}`;
    $('orderRate').textContent = `${money(service.unit_price)} ${service.pricing_unit}`;
    return { subtotal, discount, total: Math.round((subtotal - discount) * 100) / 100, weight, loads };
  }
  function orderError(message, field) {
    $('orderError').textContent = message;
    $('orderError').classList.remove('hidden');
    if (field) { const target = field === 'orderCustomer' ? $('orderCustomerSearch') : $(field); target.setAttribute('aria-invalid', 'true'); target.setAttribute('aria-describedby','orderError'); target.focus(); }
  }
  function openStatus(orderId) {
    const order = orders.find((item) => item.order_id === Number(orderId));
    if (!order) return;
    editedOrder = order.order_id;
    $('statusOrderName').textContent = `${customerName(order.customer_id)} - ${services[order.service_id].service_name} - ${money(order.total_amount)}`;
    $('statusCompletion').value = window.LaundryDates.input(order.estimated_completion);
    $('statusOrderDate').textContent = window.LaundryDates.format(order.order_date);
    $('orderStatusSelect').value = order.order_status;
    $('collectPayment').checked = false;
    $('collectPaymentDate').value = window.LaundryDates.input();
    $('collectPaymentReference').value = '';
    $('collectPaymentMethod').value = 'Cash';
    $('statusError').classList.add('hidden');
    refreshSettlement();
    openDialog('statusOverlay');
  }
  function exportCSV(kind, rows) {
    const fields = kind === 'orders'
      ? ['order_id', 'order_number', 'customer_id', 'service_id', 'created_by', 'order_date', 'customer', 'service', 'weight', 'subtotal', 'discount', 'total_amount', 'order_status', 'estimated_completion']
      : ['payment_id', 'order_id', 'received_by', 'payment_date', 'order_number', 'customer', 'payment_method', 'reference_number', 'amount_paid', 'payment_status'];
    const cell = (value) => {
      let text = String(value ?? '');
      if (/^[=+@\-\t\r]/.test(text)) text = "'" + text;
      return '"' + text.replace(/"/g, '""') + '"';
    };
    const csv = [fields, ...rows.map((row) => {
      const order = kind === 'orders' ? row : orders.find((item) => item.order_id === row.order_id);
      const enriched = { ...row, customer: customerName(order?.customer_id), service: services[order?.service_id]?.service_name, order_number: order?.order_number };
      return fields.map((field) => enriched[field]);
    })].map((row) => row.map(cell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `laundry-${kind}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    app.showToast(`${kind === 'orders' ? 'Orders' : 'Payments'} exported.`);
  }

  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal-overlay hidden" id="orderOverlay">
      <section class="modal order-modal" role="dialog" aria-modal="true" aria-labelledby="orderFormTitle" aria-describedby="orderDemoNote">
        <header class="modal-header"><div><span class="eyebrow">LAUNDRY ORDER</span><h2 id="orderFormTitle">Create order</h2></div><button type="button" class="icon-button" data-close="orderOverlay" aria-label="Close create order">${app.icon('x')}</button></header>
        <p class="dialog-description" id="orderDemoNote">Add a laundry order to this demo workspace. No payment is collected.</p>
        <form id="orderForm" novalidate>
          <div class="form-grid">
            <label class="form-field full-width">Customer <select id="orderCustomer" required aria-describedby="orderError"></select></label>
            <label class="form-field full-width">Service <select id="orderService">${Object.entries(services).map(([id, service]) => `<option value="${id}">${service.service_name} · ${money(service.unit_price)} ${service.pricing_unit}</option>`).join('')}</select></label>
            <label class="form-field">Weight (kg)<input id="orderWeight" type="number" min="0.01" max="999.99" step="0.01" value="1" aria-describedby="orderError"></label>
            <label class="form-field hidden" id="orderLoadsField">Number of loads<input id="orderLoads" type="number" min="1" max="1000" step="1" value="1" aria-describedby="orderError"></label>
            <label class="form-field">Discount (₱)<input id="orderDiscount" type="number" min="0" max="99999999.99" step="0.01" value="0" aria-describedby="orderError"></label>
            <label class="form-field">Date placed<input id="orderDate" type="datetime-local" required aria-describedby="orderError"></label>
            <label class="form-field">Estimated completion (optional)<input id="orderCompletion" type="datetime-local" aria-describedby="orderError"></label>
          </div>
          <div class="order-calculation" aria-live="polite"><div><span>Service rate</span><strong id="orderRate"></strong></div><div><span>Subtotal</span><strong id="orderSubtotal"></strong></div><div class="calculation-total"><span>Total amount</span><strong id="orderTotal"></strong></div></div>
          <p class="form-error hidden" id="orderError" role="alert"></p>
          <div class="modal-actions"><button type="button" class="secondary-button" data-close="orderOverlay">Cancel</button><button type="submit" class="primary-button signature-action">${app.icon('plus')} Create order</button></div>
        </form>
      </section>
    </div>
    <div class="modal-overlay hidden" id="statusOverlay"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="statusTitle" aria-describedby="statusOrderName">
      <header class="modal-header"><div><span class="eyebrow">ORDER PROGRESS</span><h2 id="statusTitle">Update order</h2></div><button type="button" class="icon-button" data-close="statusOverlay" aria-label="Close update status">${app.icon('x')}</button></header>
      <p class="dialog-description" id="statusOrderName"></p><p class="muted" id="statusOrderDate"></p><p class="status-guidance">Finished laundering? Choose <strong>Ready for Pickup</strong>. Handed back to the customer? Choose <strong>Collected</strong>. Collected does not automatically mean paid. If you received payment, record it below.</p>
      <form id="orderStatusForm" novalidate><label class="form-field">Order status<select id="orderStatusSelect">${statuses.map((status) => `<option>${status}</option>`).join('')}</select></label><label class="form-field status-completion">Estimated completion (optional)<input type="datetime-local" id="statusCompletion" aria-describedby="statusError"></label><div class="settlement-box hidden" id="collectionSettlement"><label class="settlement-choice"><input type="checkbox" id="collectPayment"><span id="collectPaymentLabel">Payment received: record outstanding balance</span></label><div class="settlement-fields form-grid hidden" id="collectionPaymentFields"><label class="form-field">Payment method<select id="collectPaymentMethod"><option>Cash</option><option>GCash</option><option>Card</option><option>Bank transfer</option></select></label><label class="form-field">Payment received at<input type="datetime-local" id="collectPaymentDate" aria-describedby="statusError"></label><label class="form-field full-width">Reference number (optional)<input id="collectPaymentReference" maxlength="30" aria-describedby="statusError"></label></div><p class="report-basis">Only select this if the payment was actually received. The payment date determines which reporting period includes it.</p></div><p class="form-error hidden" role="alert" id="statusError"></p><div class="modal-actions"><button type="button" class="secondary-button" data-close="statusOverlay">Cancel</button><button type="submit" class="primary-button">Save changes</button></div></form>
    </section></div>
    <div class="modal-overlay hidden" id="deleteOverlay"><section class="modal" role="alertdialog" aria-modal="true" aria-labelledby="deleteTitle" aria-describedby="deleteDescription"><header class="modal-header"><h2 id="deleteTitle">Delete customer?</h2></header><p id="deleteDescription" class="dialog-description"></p><div class="modal-actions"><button type="button" class="secondary-button" id="cancelDelete">Cancel</button><button type="button" class="primary-button destructive" id="confirmDelete">Delete customer</button></div></section></div>
  `);

  window.LaundryWorkspace = {
    openDialog, closeDialog,
    savePayments: (next) => persistLedger(orders, next),
    lastError:()=>persistenceError, refreshViews:()=>subscribers.forEach((callback)=>callback()),
    currentUser, localDate, getCustomerRecords: app.getCustomerRecords,
    getPaymentCustomerId: (payment) => orders.find((order) => order.order_id === payment.order_id)?.customer_id,
    getUserName: (id) => {const user=online?.data.users.find((record)=>record.user_id===id) || (id===currentUser.user_id?currentUser:null);return user?`${user.first_name} ${user.last_name}`:`Staff #${id}`;},
    seedCustomers, getOrders: () => orders, getPayments: () => payments,
    getCustomers: app.getCustomers, getCustomerName: customerName,
    getService: (id) => services[id] || { service_name: 'General service', unit_price: 0, pricing_unit: 'per kg' },
    money, escape: app.escape, icon: app.icon, showToast: app.showToast,
    openCreateOrder, openStatus, exportCSV,
    openOrder: (id) => {
      const order = orders.find((item) => item.order_id === Number(id));
      if (!order) return;
      $('orderInfoTitle').textContent = order.order_number;
      const details = [ ['Customer', customerName(order.customer_id)], ['Service type', services[order.service_id].service_name],
        ['Date placed', window.LaundryDates.format(order.order_date)], ['Created by', window.LaundryWorkspace.getUserName(order.created_by)],
        ['Weight (kg)', order.weight === null ? 'Not recorded' : Number(order.weight).toFixed(2)],
        ['Subtotal', money(order.subtotal)], ['Discount', money(order.discount)], ['Total amount', money(order.total_amount)],
        ['Order status', order.order_status], ['Payment status', window.LaundryWorkspace.orderPaymentState(order).label], ['Balance due', money(window.LaundryWorkspace.orderBalance(order))], ['Estimated completion', window.LaundryDates.format(order.estimated_completion)] ];
      $('orderInfoFields').innerHTML = details.map(([label, value]) => `<div class="detail-field"><dt>${app.escape(label)}</dt><dd>${app.escape(value)}</dd></div>`).join('');
      openDialog('orderInfoOverlay');
    },
    subscribe: (callback) => { subscribers.add(callback); return () => subscribers.delete(callback); },
    confirmDelete: (name, callback) => {
      deleteAction = callback;
      confirmationFocus = document.activeElement;
      $('deleteDescription').textContent = `Delete ${name} from this demo workspace? This removes their customer record from this browser.`;
      $('detailOverlay').classList.add('hidden');
      openDialog('deleteOverlay');
      $('cancelDelete').focus();
    }
  };
  document.body.insertAdjacentHTML('beforeend', `<div class="modal-overlay hidden" id="orderInfoOverlay"><section class="modal order-modal" role="dialog" aria-modal="true" aria-labelledby="orderInfoTitle"><header class="modal-header"><div><span class="eyebrow">ORDER DETAILS</span><h2 id="orderInfoTitle"></h2></div><button type="button" class="icon-button" data-close="orderInfoOverlay" aria-label="Close order details">${app.icon('x')}</button></header><dl class="detail-fields" id="orderInfoFields"></dl><div class="modal-actions"><button class="secondary-button" type="button" data-close="orderInfoOverlay">Close</button></div></section></div>`);

  ['orderService', 'orderWeight', 'orderLoads', 'orderDiscount'].forEach((id) => $(id).addEventListener('input', calculate));
  $('orderForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = $('orderForm');
    form.querySelectorAll('[aria-invalid]').forEach((field) => field.removeAttribute('aria-invalid'));
    const customerId = Number($('orderCustomer').value);
    const { subtotal, discount, total, weight, loads } = calculate();
    if (!app.getCustomers().some((customer) => customer.id === customerId)) return orderError('Choose a customer for this order.', 'orderCustomer');
    if ((services[$('orderService').value].pricing_unit === 'per kg' && weight === null) || (weight !== null && (!Number.isFinite(weight) || weight <= 0 || weight > 999.99 || !$('orderWeight').validity.valid))) return orderError('Enter a weight from 0.01 to 999.99 kg for weight-based services. Weight is optional for per-load services.', 'orderWeight');
    if (services[$('orderService').value].pricing_unit === 'per load' && (!Number.isInteger(loads) || loads < 1 || loads > 1000)) return orderError('Enter a whole number of loads between 1 and 1,000.', 'orderLoads');
    if (!Number.isFinite(discount) || discount < 0 || discount > subtotal || !$('orderDiscount').validity.valid) return orderError('Discount must be between zero and the subtotal, with up to two decimal places.', 'orderDiscount');
    if (!$('orderDate').validity.valid || !$('orderDate').value) return orderError('Enter a valid order date and time.', 'orderDate');
    if (!$('orderCompletion').validity.valid || ($('orderCompletion').value && $('orderCompletion').value < $('orderDate').value)) return orderError('Completion must be on or after the order date.', 'orderCompletion');
    if (subtotal > 99999999.99 || total > 99999999.99) return orderError('Order amount exceeds the supported maximum of ₱99,999,999.99.', 'orderWeight');
    const id = Math.max(...orders.map((order) => order.order_id), 0) + 1;
    const year = $('orderDate').value.slice(0, 4);
    const number = `ORD-${year}-${String(id).padStart(3, '0')}`;
    const order = { order_id: id, order_number: number, customer_id: customerId, service_id: Number($('orderService').value), order_date: $('orderDate').value.replace('T', ' '), estimated_completion: $('orderCompletion').value.replace('T', ' ') || null, created_by: currentUser.user_id, weight, ...(online?{loads}:{}), subtotal, discount, total_amount: total, order_status: 'Pending' };
    if (!await window.LaundryPersistence.withBusy(form,()=>persist([order, ...orders]))) return orderError(persistenceError || 'Browser storage is unavailable. Your order was not saved.');
    closeDialog('orderOverlay');
    app.showToast(`${online ? orders.find((record)=>record.order_id===online.data.mutation.order_id).order_number : number} created.`);
  });
  function refreshSettlement() {
    const order = orders.find((item) => item.order_id === editedOrder);
    const due = order && window.LaundryWorkspace.orderBalance ? window.LaundryWorkspace.orderBalance(order) : 0;
    const visible = $('orderStatusSelect').value === 'Collected' && due > 0;
    $('collectionSettlement').classList.toggle('hidden', !visible);
    if (!visible) $('collectPayment').checked = false;
    $('collectPaymentLabel').textContent = `Payment received: record remaining ${money(due)}`;
    $('collectionPaymentFields').classList.toggle('hidden', !visible || !$('collectPayment').checked);
    document.querySelector('#orderStatusForm button[type="submit"]').textContent = visible && $('collectPayment').checked ? 'Save and record payment' : 'Save changes';
  }
  $('orderStatusSelect').addEventListener('change', refreshSettlement);
  $('collectPayment').addEventListener('change', refreshSettlement);
  $('orderStatusForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const selected = orders.find((order) => order.order_id === editedOrder);
    const completion = $('statusCompletion').value;
    if (!$('statusCompletion').validity.valid || (completion && window.LaundryDates.timestamp(completion) < window.LaundryDates.timestamp(selected.order_date))) {
      $('statusError').textContent = 'Completion must be on or after the order date.'; $('statusError').classList.remove('hidden'); $('statusCompletion').focus(); return;
    }
    const next = orders.map((order) => order.order_id === editedOrder ? { ...order, estimated_completion: completion.replace('T', ' ') || null, order_status: $('orderStatusSelect').value } : order);
    let nextPayments = payments;
    if ($('orderStatusSelect').value === 'Collected' && $('collectPayment').checked) {
      const due = window.LaundryWorkspace.orderBalance(selected);
      if (due > 0) {
        if (!$('collectPaymentDate').value || !$('collectPaymentDate').validity.valid || $('collectPaymentReference').value.length > 30) {
          $('statusError').textContent = 'Enter a valid payment date and a reference of at most 30 characters.'; $('statusError').classList.remove('hidden'); $('collectPaymentDate').focus(); return;
        }
        nextPayments = [...payments, { payment_id: Math.max(0, ...payments.map((payment) => payment.payment_id)) + 1, order_id: selected.order_id, received_by: currentUser.user_id, payment_date: $('collectPaymentDate').value.replace('T', ' '), amount_paid: Math.round(due * 100) / 100, payment_method: $('collectPaymentMethod').value, payment_status: 'Paid', reference_number: $('collectPaymentReference').value.trim() || null }];
      }
    }
    const paymentsBeforeSave = payments.length;
    if (!await window.LaundryPersistence.withBusy($('orderStatusForm'),()=>persistLedger(next, nextPayments))) { $('statusError').textContent = persistenceError || 'Browser storage is unavailable. Status was not saved. Try again.'; $('statusError').classList.remove('hidden'); return; }
    closeDialog('statusOverlay');
    app.showToast(nextPayments.length > paymentsBeforeSave ? 'Order collected and payment recorded.' : 'Order status updated.');
  });
  $('cancelDelete').addEventListener('click', () => {
    closeDialog('deleteOverlay');
    $('detailOverlay').classList.remove('hidden');
    $('app').inert = true;
    document.body.classList.add('dialog-open');
    confirmationFocus?.focus();
    deleteAction = null;
  });
  $('confirmDelete').addEventListener('click', () => {
    const action = deleteAction;
    closeDialog('deleteOverlay');
    action?.();
    subscribers.forEach((callback) => callback());
    deleteAction = null;
  });
  document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => closeDialog(button.dataset.close)));
  ['orderOverlay', 'statusOverlay', 'orderInfoOverlay'].forEach((id) => $(id).addEventListener('click', (event) => { if (event.target === $(id)) closeDialog(id); }));
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!$('deleteOverlay').classList.contains('hidden')) { $('cancelDelete').click(); return; }
    if (activeDialog && !$(activeDialog).classList.contains('hidden')) closeDialog(activeDialog);
  });
  $('customerForm').addEventListener('submit', () => subscribers.forEach((callback) => callback()));
  app.refresh();
})();
