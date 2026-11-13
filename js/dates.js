(function () {
  'use strict';
  const timeZone = 'Asia/Manila';
  function parse(value) {
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      value = value.$date ?? value;
      if (value && typeof value === 'object' && '$numberLong' in value) value = Number(value.$numberLong);
    }
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'string') {
      value = value.trim().replace(' ', 'T');
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) value += 'T00:00:00+08:00';
      else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(value)) value += '+08:00';
    }
    const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  function input(value = new Date(), dateOnly = false) {
    const date = parse(value);
    if (!date) return '';
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23' }).formatToParts(date);
    const part = (type) => parts.find((item) => item.type === type).value;
    const day = `${part('year')}-${part('month')}-${part('day')}`;
    return dateOnly ? day : `${day}T${part('hour')}:${part('minute')}`;
  }
  function format(value, dateOnly = false) {
    const date = parse(value);
    if (!date) return 'Not set';
    const day = new Intl.DateTimeFormat('en-US', { timeZone, month:'short', day:'numeric', year:'numeric' }).format(date);
    return dateOnly ? day : `${day} at ${new Intl.DateTimeFormat('en-US', { timeZone, hour:'numeric', minute:'2-digit' }).format(date)}`;
  }
  function range(period, anchor = input(new Date(), true)) {
    const valid = /^\d{4}-\d{2}-\d{2}$/.test(anchor) && parse(anchor);
    if (period === 'all' || !valid) return null;
    const [year, month, day] = anchor.split('-').map(Number);
    let start = Date.UTC(year, month-1, day);
    let end;
    if (period === 'week') { start -= ((new Date(start).getUTCDay()+6)%7)*86400000; end = start+7*86400000; }
    else if (period === 'month') { start=Date.UTC(year,month-1,1); end=Date.UTC(year,month,1); }
    else if (period === 'year') { start=Date.UTC(year,0,1); end=Date.UTC(year+1,0,1); }
    else return null;
    return { start:start-8*3600000, end:end-8*3600000 };
  }
  function within(value, period, anchor) {
    const bounds=range(period,anchor);
    if (!bounds) return true;
    const date=parse(value);
    return !!date && date.getTime()>=bounds.start && date.getTime()<bounds.end;
  }
  function rangeLabel(period, anchor) {
    const bounds=range(period,anchor);
    return bounds ? `${format(new Date(bounds.start),true)} to ${format(new Date(bounds.end-1),true)}` : 'All time';
  }
  function controls(prefix) {
    return `<div class="period-toolbar"><label>Reporting period<select id="${prefix}Period"><option value="all">All time</option><option value="week">Week</option><option value="month">Month</option><option value="year">Year</option></select></label><label id="${prefix}DateLabel" class="hidden">Containing date<input id="${prefix}Date" type="date" value="${input(new Date(),true)}"></label><p id="${prefix}PeriodLabel" aria-live="polite">All time</p></div>`;
  }
  window.LaundryDates = { timeZone, parse, input, format, range, within, rangeLabel, controls, timestamp:(value)=>parse(value)?.getTime() || 0 };
})();
