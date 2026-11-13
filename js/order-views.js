/* One presentation contract for schema-backed order information across all pages. */
(function () {
  'use strict';
  const workspace = window.LaundryWorkspace;
  const escape = workspace.escape;
  const money = workspace.money;
  const tones = { Pending: 'status-pending', 'In Progress': 'status-progress', 'Ready for Pickup': 'status-ready', Collected: 'status-collected' };
  const columns = ['Actions', 'Order #', 'Customer', 'Service type', 'Payment status', 'Order status', 'Date placed', 'Weight (kg)', 'Subtotal', 'Discount', 'Total amount', 'Estimated completion', 'Created by'];
  workspace.orderTableHead = (options = {}) => '<tr>' + [...columns, ...(options.balance ? ['Balance due'] : [])].map((name) => `<th scope="col"${['Weight (kg)', 'Subtotal', 'Discount', 'Total amount', 'Balance due'].includes(name) ? ' class="amount"' : ''}>${name}</th>`).join('') + '</tr>';
  workspace.customerServices = (customerId) => [...new Set(workspace.getOrders().filter((order) => order.customer_id === Number(customerId)).map((order) => workspace.getService(order.service_id).service_name))].sort();
  workspace.orderBalance = (order) => Math.max(0, Math.round(Number(order.total_amount)*100) - workspace.getPayments().filter((payment) => payment.order_id === order.order_id && payment.payment_status === 'Paid').reduce((sum, payment) => sum + Math.round(Number(payment.amount_paid)*100), 0))/100;
  workspace.orderPaymentState = (order) => {
    const due = workspace.orderBalance(order);
    const total = Math.round(Number(order.total_amount)*100)/100;
    if (due === 0) return { value:'Paid', label:total === 0 ? 'No payment due' : 'Paid', tone:'status-paid', due };
    if (due < total) return { value:'Partially paid', label:'Partially paid', tone:'status-progress', due };
    return { value:'Unpaid', label:'Unpaid', tone:'status-pending', due };
  };
  workspace.orderTableRows = (orders, options = {}) => orders.map((order) => {
    const payment = workspace.orderPaymentState(order);
    return `<tr data-order-record="${order.order_id}">
      <td class="row-actions"><button type="button" class="secondary-button" data-update-order="${order.order_id}" aria-label="Update order for ${escape(workspace.getCustomerName(order.customer_id))}, ${escape(workspace.getService(order.service_id).service_name)}">Update order</button><span class="row-links"><button type="button" class="text-button" data-view-order="${order.order_id}">Details</button><button type="button" class="text-button" data-record-payment="${order.order_id}">Payment</button></span></td>
      <td class="mono">${escape(order.order_number)}</td><td>${escape(workspace.getCustomerName(order.customer_id))}</td>
      <td>${escape(workspace.getService(order.service_id).service_name)}</td>
      <td data-order-payment="${escape(payment.value)}"><div class="order-payment-state"><span class="status-badge ${payment.tone}">${escape(payment.label)}</span><small>${payment.due > 0 ? escape(money(payment.due)) + ' due' : 'No balance due'}</small></div></td>
      <td><span class="status-badge ${tones[order.order_status] || ''}">${escape(order.order_status)}</span></td>
      <td>${escape(window.LaundryDates.format(order.order_date))}</td>
      <td class="amount">${order.weight === null ? 'Not recorded' : Number(order.weight).toFixed(2)}</td>
      <td class="amount">${escape(money(order.subtotal))}</td><td class="amount">${escape(money(order.discount))}</td>
      <td class="amount"><strong>${escape(money(order.total_amount))}</strong></td>
      <td>${escape(window.LaundryDates.format(order.estimated_completion))}</td><td>${escape(workspace.getUserName(order.created_by))}</td>
      ${options.balance ? `<td class="amount">${escape(money(workspace.orderBalance(order)))}</td>` : ''}
    </tr>`;
  }).join('');
  document.addEventListener('click', (event) => {
    const view = event.target.closest('[data-view-order]');
    if (view) workspace.openOrder(Number(view.dataset.viewOrder));
    const update = event.target.closest('[data-update-order]');
    if (update) workspace.openStatus(Number(update.dataset.updateOrder));
    const payment = event.target.closest('[data-record-payment]');
    if (payment) workspace.openPayment({ orderId: Number(payment.dataset.recordPayment) });
  });
  window.LaundryApp.refresh();
})();
