(function () {
  'use strict';

  const workspace = window.LaundryWorkspace;
  const page = document.getElementById('overviewPage');
  if (!workspace || !page) return;

  const PAGE_SIZE = 7;
  const statuses = ['All', 'Pending', 'In Progress', 'Ready for Pickup', 'Collected'];
  const tones = {
    'Pending': 'status-pending',
    'In Progress': 'status-progress',
    'Ready for Pickup': 'status-ready',
    'Collected': 'status-collected'
  };
  const state = { search: '', status: 'All', payment: 'All', page: 1, period: 'all', date: window.LaundryDates.input(new Date(), true) };
  const dates = window.LaundryDates;
  const inPeriod = (value) => dates.within(value, state.period, state.date);
  const escape = workspace.escape;
  const money = workspace.money;
  const icon = workspace.icon;
  const element = (id) => document.getElementById(id);
  const sum = (rows, key) => rows.reduce((total, row) => total + Number(row[key] || 0), 0);

  page.setAttribute('aria-labelledby', 'overviewTitle');
  page.innerHTML = `
    <header class="page-header">
      <div><h1 id="overviewTitle">Overview</h1><p>Keep track of laundry orders, payments, and your daily workload.</p></div>
      <button type="button" class="primary-button signature-action" data-overview-action="create">${icon('plus')} Create order</button>
    </header>
    ${dates.controls('overview')}<p class="report-basis">Orders and net order value use date placed. Payments collected uses payment date. Times are in Philippine time.</p>
    <div class="summary-grid" id="overviewSummary" aria-label="Laundry order summary"></div>
    <section class="panel" aria-labelledby="ordersHeading">
      <div class="panel-header">
        <div class="panel-heading"><h2 id="ordersHeading">Laundry orders</h2><p>Every order, from drop-off to collection.</p></div>
        <div class="panel-actions">
          <a class="text-button" href="#transactions">View payment history</a>
          <button type="button" class="secondary-button" data-overview-action="export">${icon('download')} Export CSV</button>
        </div>
      </div>
      <div class="workspace-toolbar">
        <div class="filter-tabs" id="orderStatusFilters" role="group" aria-label="Filter orders by status"></div>
        <label class="payment-status-filter">Payment status<select id="orderPaymentFilter"><option value="All">All payments</option><option value="Paid">Paid / no balance due</option><option value="Partially paid">Partially paid</option><option value="Unpaid">Unpaid</option></select></label>
        <label class="workspace-search">
          <span class="sr-only">Search orders by order number or customer</span>
          ${icon('search')}
          <input type="search" id="overviewSearch" placeholder="Search orders or customers..." autocomplete="off">
          <button type="button" class="icon-button hidden" id="overviewClearSearch" data-overview-action="clear-search" aria-label="Clear order search">${icon('x')}</button>
        </label>
      </div>
      <div class="table-container" tabindex="0" role="region" aria-label="Laundry orders table">
        <table class="workspace-table">
          <thead>${workspace.orderTableHead({ action: true })}</thead>
          <tbody id="overviewOrderRows"></tbody>
        </table>
        <div class="empty-state hidden" id="overviewEmpty" role="status">
          <span class="empty-state-icon">${icon('search')}</span>
          <strong>No matching orders</strong><p>Try another order number, customer, or status.</p>
          <button type="button" class="text-button" data-overview-action="reset">Clear filters</button>
        </div>
      </div>
      <footer class="table-footer">
        <p id="overviewResults" aria-live="polite"></p>
        <nav class="pagination" id="overviewPagination" aria-label="Order list pages"></nav>
      </footer>
    </section>
    <p class="demo-caption">Demo workspace · Orders and payment records are stored in this browser.</p>
  `;

  function filteredOrders() {
    const query = state.search.trim().toLocaleLowerCase();
    return workspace.getOrders().filter((order) => {
      const matchesStatus = state.status === 'All' || order.order_status === state.status;
      const text = `${order.order_number} ${workspace.getCustomerName(order.customer_id)}`.toLocaleLowerCase();
      const matchesPayment = state.payment === 'All' || workspace.orderPaymentState(order).value === state.payment;
      return matchesStatus && matchesPayment && inPeriod(order.order_date) && text.includes(query);
    }).sort((a, b) => dates.timestamp(b.order_date) - dates.timestamp(a.order_date) || b.order_id - a.order_id);
  }

  function renderSummary() {
    const orders = workspace.getOrders().filter((order) => inPeriod(order.order_date));
    const payments = workspace.getPayments().filter((payment) => payment.payment_status === 'Paid' && inPeriod(payment.payment_date));
    const total = sum(orders, 'total_amount');
    const weight = sum(orders, 'weight');
    const weighedOrders = orders.filter((order) => order.weight !== null).length;
    const active = orders.filter((order) => order.order_status !== 'Collected').length;
    const collected = sum(payments, 'amount_paid');
    const cash = sum(payments.filter((payment) => payment.payment_method === 'Cash'), 'amount_paid');
    const gcash = sum(payments.filter((payment) => payment.payment_method === 'GCash'), 'amount_paid');
    const pipeline = [
      ['Pending', 'Pending', 'pending'], ['In Progress', 'In wash', 'progress'],
      ['Ready for Pickup', 'Ready', 'ready'], ['Collected', 'Collected', 'collected']
    ].map(([status, label, tone]) => `<span class="pipeline-step pipeline-${tone}"><strong>${orders.filter((order) => order.order_status === status).length}</strong><span>${label}</span></span>`).join('');
    const outstanding = orders.reduce((sum, order) => sum + workspace.orderBalance(order), 0);
    const other = sum(payments.filter((payment) => !['Cash', 'GCash'].includes(payment.payment_method)), 'amount_paid');
    const mixTotal = cash + gcash + other;
    const mix = `<div class="payment-mix"><div class="payment-mix-bar" aria-hidden="true">${[[cash, 'cash'], [gcash, 'gcash'], [other, 'other']].map(([amount, tone]) => `<span class="mix-${tone}" style="width:${mixTotal ? amount / mixTotal * 100 : 0}%"></span>`).join('')}</div><div class="payment-mix-labels"><span>Cash ${escape(money(cash))}</span><span>GCash ${escape(money(gcash))}</span><span>Other ${escape(money(other))}</span></div></div>`;
    const cards = [
      { label: 'Total orders', value: orders.length.toLocaleString('en-US'), note: `${active} active ${active === 1 ? 'order' : 'orders'}`, visualFooter: `<div class="order-pipeline" aria-label="Orders by processing stage">${pipeline}</div>`, icon: 'layout-dashboard' },
      { label: 'Net order value', value: money(total), note: 'Orders placed in the selected period', footer: `${money(sum(orders, 'discount'))} in discounts`, icon: 'receipt' },
      { label: 'Laundry volume', value: `${weight.toFixed(2)} kg`, note: 'Recorded weight across all orders', footer: `${weighedOrders ? (weight / weighedOrders).toFixed(2) : '0.00'} kg average recorded weight`, icon: 'scale' },
      { label: 'Payments collected', value: money(collected), note: `${money(outstanding)} due on orders placed in this period`, visualFooter: mix, icon: 'wallet' }
    ];
    element('overviewSummary').innerHTML = cards.map((card) => `
      <article class="summary-card">
        <div class="metric-label">${escape(card.label)}<span class="metric-icon">${icon(card.icon)}</span></div>
        <div class="metric-value">${escape(card.value)}</div>
        <p class="metric-note">${escape(card.note)}</p>
        <div class="metric-footer">${card.visualFooter || escape(card.footer)}</div>
      </article>
    `).join('');
  }

  function renderStatusFilters() {
    const orders = workspace.getOrders().filter((order) => inPeriod(order.order_date) && (state.payment === 'All' || workspace.orderPaymentState(order).value === state.payment));
    element('orderStatusFilters').innerHTML = statuses.map((status) => {
      const count = status === 'All' ? orders.length : orders.filter((order) => order.order_status === status).length;
      const active = state.status === status;
      return `<button type="button" class="filter-tab${active ? ' active' : ''}" data-order-status="${escape(status)}" aria-pressed="${active}">${escape(status === 'All' ? 'All orders' : status)} <span class="filter-count">${count}</span></button>`;
    }).join('');
  }

  function renderRows() {
    const rows = filteredOrders();
    const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    state.page = Math.max(1, Math.min(state.page, totalPages));
    const start = (state.page - 1) * PAGE_SIZE;
    element('overviewOrderRows').innerHTML = workspace.orderTableRows(rows.slice(start, start + PAGE_SIZE), { context: 'overview', action: true });
    element('overviewEmpty').classList.toggle('hidden', rows.length > 0);
    element('overviewClearSearch').classList.toggle('hidden', !state.search);
    element('overviewResults').textContent = `${rows.length ? start + 1 : 0}–${Math.min(start + PAGE_SIZE, rows.length)} of ${rows.length} orders`;
    const pageNumbers = new Set([1, state.page - 1, state.page, state.page + 1, totalPages]);
    let previous = 0;
    const buttons = [...pageNumbers].filter((number) => number > 0 && number <= totalPages).sort((a, b) => a - b).map((number) => {
      const gap = previous && number - previous > 1 ? '<span class="pagination-ellipsis" aria-hidden="true">…</span>' : '';
      previous = number;
      return `${gap}<button type="button" class="page-button${number === state.page ? ' active' : ''}" data-order-page="${number}" aria-label="Order page ${number}"${number === state.page ? ' aria-current="page"' : ''}>${number}</button>`;
    }).join('');
    element('overviewPagination').innerHTML = `
      <button type="button" class="page-button" data-order-page="${state.page - 1}" aria-label="Previous order page"${state.page === 1 ? ' disabled' : ''}>${icon('chevron-left')}</button>
      ${buttons}
      <button type="button" class="page-button" data-order-page="${state.page + 1}" aria-label="Next order page"${state.page === totalPages ? ' disabled' : ''}>${icon('chevron-right')}</button>
    `;
  }

  function render() {
    renderSummary();
    renderStatusFilters();
    renderRows();
  }

  page.addEventListener('change', (event) => {
    if (event.target.id === 'orderPaymentFilter') { state.payment=event.target.value; state.page=1; renderStatusFilters(); renderRows(); return; }
    if (!['overviewPeriod','overviewDate'].includes(event.target.id)) return;
    state.period=element('overviewPeriod').value; state.date=element('overviewDate').value || dates.input(new Date(),true); state.page=1;
    element('overviewDateLabel').classList.toggle('hidden',state.period==='all');
    element('overviewPeriodLabel').textContent=dates.rangeLabel(state.period,state.date); render();
  });

  page.addEventListener('input', (event) => {
    if (event.target.id !== 'overviewSearch') return;
    state.search = event.target.value;
    state.page = 1;
    renderRows();
  });

  page.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    if (button.dataset.orderInfo) { workspace.openOrder(Number(button.dataset.orderInfo)); return; }
    if (button.dataset.orderStatus) {
      state.status = button.dataset.orderStatus;
      state.page = 1;
      renderStatusFilters();
      renderRows();
      element('orderStatusFilters').querySelector(`[data-order-status="${state.status}"]`).focus();
    } else if (button.dataset.orderPage) {
      state.page = Number(button.dataset.orderPage);
      renderRows();
      element('overviewPagination').querySelector('[aria-current="page"]').focus();
    } else if (button.dataset.orderUpdate) {
      workspace.openStatus(Number(button.dataset.orderUpdate));
    } else if (button.dataset.overviewAction === 'create') {
      workspace.openCreateOrder();
    } else if (button.dataset.overviewAction === 'export') {
      workspace.exportCSV('orders', filteredOrders());
    } else if (['clear-search', 'reset'].includes(button.dataset.overviewAction)) {
      state.search = '';
      state.page = 1;
      element('overviewSearch').value = '';
      if (button.dataset.overviewAction === 'reset') {
        state.status = 'All';
        state.payment = 'All';
        element('orderPaymentFilter').value = 'All';
        state.period = 'all';
        element('overviewPeriod').value = 'all';
        element('overviewDateLabel').classList.add('hidden');
        element('overviewPeriodLabel').textContent = 'All time';
        renderSummary();
        renderStatusFilters();
      }
      renderRows();
      element('overviewSearch').focus();
    }
  });

  workspace.subscribe(render);
  window.LaundryOverview = { render };
  render();
})();
