(function () {
  'use strict';

  const workspace = window.LaundryWorkspace;
  const section = document.getElementById('transactionsPage');
  const PAGE_SIZE = 7;
  const state = { customerId: '', search: '', page: 1, orderPage: 1, period:'all', date:window.LaundryDates.input(new Date(),true) };
  const dates=window.LaundryDates;
  const inPeriod=(value)=>dates.within(value,state.period,state.date);
  const escape = workspace.escape;
  const statusClasses = {
    Paid: 'status-paid',
    Pending: 'status-pending',
    'In Progress': 'status-progress',
    'Ready for Pickup': 'status-ready',
    Collected: 'status-collected'
  };

  section.innerHTML = `
    <header class="page-header">
      <div>
        <h1 id="transactionsTitle">Transactions</h1>
        <p>Order history, recorded payments, and outstanding balances.</p>
      </div>
      <button class="primary-button signature-action" type="button" data-tx-action="create">
        ${workspace.icon('plus')} Create order
      </button>
    </header>
    <nav class="workspace-tabs" aria-label="Order workspace">
      <a href="#overview">Orders overview</a>
      <a href="#transactions" class="active" aria-current="page">Customer history &amp; payments</a>
    </nav>
    ${dates.controls('transactions')}<p class="report-basis">Orders use date placed; payments use payment date. Balance due uses all recorded paid payments for the selected orders.</p>
    <div class="workspace-toolbar">
      <label class="form-field" for="transactionCustomer">
        <span>Customer account</span>
        <select id="transactionCustomer"></select>
      </label>
      <p class="demo-caption">Local demo records - changes are saved in this browser.</p>
    </div>
    <div class="summary-grid summary-grid--three" id="transactionSummary" aria-label="Account summary"></div>
      <div class="workspace-toolbar">
        <label class="workspace-search" for="transactionSearch">
          <span class="sr-only">Search order and payment history</span>
          ${workspace.icon('search')}
          <input type="search" id="transactionSearch" placeholder="Search order or payment history..." autocomplete="off">
          <button class="icon-button hidden" id="clearTransactionSearch" type="button" aria-label="Clear history search">${workspace.icon('x')}</button>
        </label>
        <button class="text-button hidden" id="resetTransactionFilters" type="button">Clear filters</button>
      </div>
    <section class="panel order-history-panel" aria-labelledby="orderHistoryTitle">
      <header class="panel-header"><div class="panel-heading"><h2 id="orderHistoryTitle">Order history</h2><p>All customer orders, including those with no payment yet.</p></div></header>
      <div class="table-container" tabindex="0" role="region" aria-label="Customer order history"><table class="workspace-table"><thead>${workspace.orderTableHead({ balance: true })}</thead><tbody id="accountOrderRows"></tbody></table><div class="empty-state hidden" id="accountOrderEmpty" role="status"><strong>No matching orders</strong><p>Choose another customer or clear the history search.</p></div></div>
      <footer class="table-footer"><p id="accountOrderResults" aria-live="polite"></p><nav class="pagination" id="accountOrderPagination" aria-label="Customer order history pages"></nav></footer>
    </section>
    <section class="panel" aria-labelledby="paymentHistoryTitle">
      <header class="panel-header">
        <div class="panel-heading">
          <h2 id="paymentHistoryTitle">Payment history</h2>
          <p>Recorded payments and their linked laundry orders.</p>
        </div>
        <div class="panel-actions">
          <button class="secondary-button" type="button" id="recordPaymentButton">Record payment</button>
          <button class="secondary-button" type="button" data-tx-action="export">
            ${workspace.icon('download')} Export CSV
          </button>
        </div>
      </header>

      <div class="table-container" tabindex="0" role="region" aria-label="Payment history table">
        <table class="workspace-table">
          <thead><tr>
            <th scope="col">Actions</th>
            <th scope="col">Order #</th>
            <th scope="col">Payment date</th>
            <th scope="col">Customer</th>

            <th scope="col">Service type</th>
            <th scope="col">Method</th>
            <th scope="col">Reference number</th>
            <th scope="col" class="amount">Amount paid</th>
            <th scope="col">Received by</th><th scope="col">Payment status</th>
            <th scope="col">Order status</th>
          </tr></thead>
          <tbody id="transactionRows"></tbody>
        </table>
        <div class="empty-state hidden" id="transactionEmpty" role="status">
          <span class="empty-state-icon">${workspace.icon('search')}</span>
          <strong id="transactionEmptyTitle">No payments recorded</strong>
          <p id="transactionEmptyDescription">This customer has no recorded payments yet.</p>
          <button class="text-button" type="button" data-tx-action="reset">Show all payments</button>
        </div>
      </div>
      <footer class="table-footer">
        <p id="transactionResults" aria-live="polite"></p>
        <nav class="pagination" id="transactionPagination" aria-label="Payment history pages"></nav>
      </footer>
    </section>
  `;

  const byId = (id) => document.getElementById(id);

  function statusBadge(status) {
    return `<span class="status-badge ${statusClasses[status] || ''}">${escape(status || 'Unknown')}</span>`;
  }

  function customerMatches(record) {
    return !state.customerId || String(record.customer_id ?? workspace.getPaymentCustomerId(record)) === state.customerId;
  }

  function matchingPayments() {
    const query = state.search.trim().toLocaleLowerCase('en');
    const orders = new Map(workspace.getOrders().map((order) => [order.order_id, order]));
    return workspace.getPayments().filter((payment) => {
      if (!customerMatches(payment) || !inPeriod(payment.payment_date)) return false;
      const order = orders.get(payment.order_id);
      return [
        `TX-${payment.payment_id}`,
        order?.order_number,
        order && workspace.getService(order.service_id).service_name,
        workspace.getCustomerName(workspace.getPaymentCustomerId(payment)),
        payment.reference_number,
        payment.payment_method,
        payment.payment_status
      ].join(' ').toLocaleLowerCase('en').includes(query);
    }).sort((a, b) => dates.timestamp(b.payment_date) - dates.timestamp(a.payment_date) || b.payment_id - a.payment_id);
  }

  function renderCustomerOptions() {
    const customers = workspace.getCustomers();
    if (state.customerId && !customers.some((customer) => String(customer.id) === state.customerId)) {
      state.customerId = '';
      state.page = 1;
    state.orderPage = 1;
    }
    byId('transactionCustomer').innerHTML = '<option value="">All customers</option>' + customers.map((customer) => {
      const name = `${customer.firstName} ${customer.lastName}`.trim();
      return `<option value="${escape(customer.id)}">${escape(name)}${customer.phone ? ' (' + escape(customer.phone) + ')' : ''}</option>`;
    }).join('');
    byId('transactionCustomer').value = state.customerId;
    window.LaundryCustomerCombobox.enhanceSelect(byId('transactionCustomer'));
  }

  function renderSummary() {
    const records = workspace.getPayments().filter(customerMatches).filter((payment) => inPeriod(payment.payment_date));
    const payments = records.filter((payment) => payment.payment_status === 'Paid');
    const orders = workspace.getOrders().filter(customerMatches).filter((order)=>inPeriod(order.order_date));
    const paid = payments.reduce((total, payment) => total + Number(payment.amount_paid), 0);
    const outstanding = orders.reduce((total, order) => {
      const received = workspace.getPayments().filter((payment)=>payment.payment_status==='Paid').filter((payment) => payment.order_id === order.order_id)
        .reduce((sum, payment) => sum + Number(payment.amount_paid), 0);
      return total + Math.max(0, Number(order.total_amount) - received);
    }, 0);
    const accountLabel = state.customerId ? workspace.getCustomerName(state.customerId) : 'All customer accounts';
    byId('transactionSummary').innerHTML = [
      { label: 'Payments received', value: workspace.money(paid), note: accountLabel },
      { label: 'Recorded payments', value: records.length.toLocaleString('en-US'), note: 'Payment records in the selected period' },
      { label: 'Outstanding balance', value: workspace.money(outstanding), note: 'Balance due on orders placed in this period' }
    ].map((metric) => `
      <article class="summary-card">
        <span class="metric-label">${escape(metric.label)}</span>
        <strong class="metric-value">${escape(metric.value)}</strong>
        <p class="metric-note">${escape(metric.note)}</p>
      </article>
    `).join('');
  }

  function renderOrderHistory() {
    const query = state.search.trim().toLowerCase();
    const orders = workspace.getOrders().filter(customerMatches).filter((order)=>inPeriod(order.order_date)).filter((order) =>
      `${order.order_number} ${workspace.getCustomerName(order.customer_id)} ${workspace.getService(order.service_id).service_name}`.toLowerCase().includes(query));
    const totalPages = Math.max(1, Math.ceil(orders.length / PAGE_SIZE));
    state.orderPage = Math.min(state.orderPage, totalPages);
    const start = (state.orderPage - 1) * PAGE_SIZE;
    byId('accountOrderRows').innerHTML = workspace.orderTableRows(orders.slice(start, start + PAGE_SIZE), { context: 'history', balance: true });
    byId('accountOrderEmpty').classList.toggle('hidden', orders.length > 0);
    byId('accountOrderResults').textContent = `${orders.length ? start + 1 : 0}–${Math.min(start + PAGE_SIZE, orders.length)} of ${orders.length} orders`;
    byId('accountOrderPagination').innerHTML = `<button type="button" class="page-button" data-history-page="${state.orderPage - 1}" aria-label="Previous customer order page" ${state.orderPage === 1 ? 'disabled' : ''}>${workspace.icon('chevron-left')}</button><span>Page ${state.orderPage} of ${totalPages}</span><button type="button" class="page-button" data-history-page="${state.orderPage + 1}" aria-label="Next customer order page" ${state.orderPage === totalPages ? 'disabled' : ''}>${workspace.icon('chevron-right')}</button>`;
  }

  function renderRows() {
    renderOrderHistory();
    const payments = matchingPayments();
    const totalPages = Math.max(1, Math.ceil(payments.length / PAGE_SIZE));
    state.page = Math.max(1, Math.min(state.page, totalPages));
    const start = (state.page - 1) * PAGE_SIZE;
    const orders = new Map(workspace.getOrders().map((order) => [order.order_id, order]));
    byId('transactionRows').innerHTML = payments.slice(start, start + PAGE_SIZE).map((payment) => {
      const order = orders.get(payment.order_id);
      const service = order ? workspace.getService(order.service_id) : null;
      return `<tr data-payment-record="${payment.payment_id}" data-payment-order="${payment.order_id}">
        <td class="row-actions"><button type="button" class="secondary-button" data-edit-payment="${payment.payment_id}">Edit payment</button></td>
        <td class="mono">${escape(order?.order_number || 'Unavailable')}</td>
        <td class="muted">${escape(dates.format(payment.payment_date))}</td>
        <td>${escape(workspace.getCustomerName(workspace.getPaymentCustomerId(payment)))}</td>

        <td>${escape(service?.service_name || 'Unavailable')}</td>
        <td>${escape(payment.payment_method)}</td>
        <td class="mono muted">${escape(payment.reference_number || '—')}</td>
        <td class="amount">${escape(workspace.money(payment.amount_paid))}</td>
        <td>${escape(workspace.getUserName(payment.received_by))}</td><td>${statusBadge(payment.payment_status)}</td>
        <td>${statusBadge(order?.order_status)}</td>
      </tr>`;
    }).join('');

    byId('transactionEmpty').classList.toggle('hidden', payments.length > 0);
    byId('transactionEmptyTitle').textContent = state.search.trim() ? 'No matching payments' : 'No payments recorded';
    byId('transactionEmptyDescription').textContent = state.search.trim()
      ? 'Try a different search or clear the filters.'
      : 'There are no recorded payments for this customer account.';
    byId('transactionResults').textContent = payments.length
      ? `Showing ${start + 1}–${Math.min(start + PAGE_SIZE, payments.length)} of ${payments.length} payments`
      : 'Showing 0 payments';
    byId('clearTransactionSearch').classList.toggle('hidden', !state.search);
    byId('resetTransactionFilters').classList.toggle('hidden', !state.customerId && !state.search && state.period === 'all');
    renderPagination(totalPages, payments.length);
  }

  function renderPagination(totalPages, total) {
    const pagination = byId('transactionPagination');
    if (total <= PAGE_SIZE) {
      pagination.innerHTML = '';
      return;
    }
    const pages = new Set([1, totalPages, state.page - 1, state.page, state.page + 1]);
    let previous = 0;
    const numbered = [...pages].filter((page) => page >= 1 && page <= totalPages).sort((a, b) => a - b).map((page) => {
      const gap = previous && page - previous > 1 ? '<span aria-hidden="true">…</span>' : '';
      previous = page;
      return `${gap}<button type="button" class="page-button ${page === state.page ? 'active' : ''}" data-tx-page="${page}" aria-label="Page ${page}" ${page === state.page ? 'aria-current="page"' : ''}>${page}</button>`;
    }).join('');
    pagination.innerHTML = `
      <button type="button" class="page-button" data-tx-page="${state.page - 1}" aria-label="Previous payment page" ${state.page === 1 ? 'disabled' : ''}>${workspace.icon('chevron-left')}</button>
      ${numbered}
      <button type="button" class="page-button" data-tx-page="${state.page + 1}" aria-label="Next payment page" ${state.page === totalPages ? 'disabled' : ''}>${workspace.icon('chevron-right')}</button>
    `;
  }

  function resetFilters() {
    state.period='all';
    byId('transactionsPeriod').value='all';
    byId('transactionsDateLabel').classList.add('hidden');
    byId('transactionsPeriodLabel').textContent='All time';
    state.customerId = '';
    state.search = '';
    state.page = 1;
    state.orderPage = 1;
    byId('transactionSearch').value = '';
    byId('transactionCustomer').value = '';
    renderSummary();
    renderRows();
  }

  function render() {
    renderCustomerOptions();
    renderSummary();
    renderRows();
  }

  byId('recordPaymentButton').addEventListener('click',()=>workspace.openPayment());
  section.addEventListener('change',(event)=>{
    if (!['transactionsPeriod','transactionsDate'].includes(event.target.id)) return;
    state.period=byId('transactionsPeriod').value; state.date=byId('transactionsDate').value || dates.input(new Date(),true); state.page=1;state.orderPage=1;
    byId('transactionsDateLabel').classList.toggle('hidden',state.period==='all');byId('transactionsPeriodLabel').textContent=dates.rangeLabel(state.period,state.date); render();
  });
  byId('transactionCustomer').addEventListener('change', (event) => {
    state.customerId = event.target.value;
    state.page = 1;
    state.orderPage = 1;
    renderSummary();
    renderRows();
  });
  byId('transactionSearch').addEventListener('input', (event) => {
    state.search = event.target.value;
    state.page = 1;
    state.orderPage = 1;
    renderRows();
  });
  byId('clearTransactionSearch').addEventListener('click', () => {
    state.search = '';
    state.page = 1;
    state.orderPage = 1;
    byId('transactionSearch').value = '';
    renderRows();
    byId('transactionSearch').focus();
  });
  byId('resetTransactionFilters').addEventListener('click', resetFilters);
  section.addEventListener('click', (event) => {
    const orderButton = event.target.closest('[data-history-order]');
    if (orderButton) { workspace.openOrder(Number(orderButton.dataset.historyOrder)); return; }
    const orderPage = event.target.closest('[data-history-page]');
    if (orderPage && !orderPage.disabled) { state.orderPage = Number(orderPage.dataset.historyPage); renderOrderHistory(); byId('accountOrderPagination').querySelector('button:not([disabled])')?.focus(); return; }
    const pageButton = event.target.closest('[data-tx-page]');
    if (pageButton && !pageButton.disabled) {
      state.page = Number(pageButton.dataset.txPage);
      renderRows();
      byId('transactionPagination').querySelector('[aria-current="page"]')?.focus();
      return;
    }
    const action = event.target.closest('[data-tx-action]')?.dataset.txAction;
    if (action === 'create') workspace.openCreateOrder();
    if (action === 'reset') resetFilters();
    if (action === 'export') {
      const payments = matchingPayments();
      if (!payments.length) {
        workspace.showToast('No payments to export. Try clearing the filters.');
        return;
      }
      workspace.exportCSV('payments', payments);
    }
  });

  workspace.subscribe(render);
  window.LaundryTransactions = { render };
  render();
})();
