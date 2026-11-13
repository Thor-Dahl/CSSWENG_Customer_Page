(function () {
  'use strict';
  const registry=new WeakMap();
  function mount(input,{items,choose,restore}) {
    const host=document.createElement('div');host.className='customer-combobox';
    input.parentNode.insertBefore(host,input);host.append(input);
    const toggle=document.createElement('button');toggle.type='button';toggle.className='combobox-toggle';toggle.textContent='⌄';toggle.setAttribute('aria-label','Show customer options');host.append(toggle);
    const popup=document.createElement('div');popup.className='customer-options hidden';popup.id=input.id+'Options';popup.setAttribute('role','listbox');popup.setAttribute('aria-label','Customers');host.append(popup);
    const status=document.createElement('span');status.className='sr-only';status.setAttribute('role','status');host.append(status);
    input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-expanded','false');input.setAttribute('aria-controls',popup.id);input.autocomplete='off';
    let matches=[],active=-1,open=false;
    function close(commit=false) {open=false;popup.classList.add('hidden');input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');if(!commit)restore?.();}
    function paint() {
      popup.replaceChildren();
      if(!matches.length){const empty=document.createElement('p');empty.textContent='No matching customers';popup.append(empty);}
      matches.forEach((item,index)=>{const option=document.createElement('div');option.id=popup.id+'-'+index;option.className='customer-option';option.setAttribute('role','option');option.setAttribute('aria-selected',String(index===active));option.textContent=item.label;option.addEventListener('mousedown',(event)=>event.preventDefault());option.addEventListener('click',()=>{choose(item);close(true);input.focus();});popup.append(option);});
      if(active>=0){input.setAttribute('aria-activedescendant',popup.id+'-'+active);popup.children[active]?.scrollIntoView({block:'nearest'});}else input.removeAttribute('aria-activedescendant');
    }
    function show(query='') {const q=query.trim().toLocaleLowerCase();matches=items().filter((item)=>(item.search || item.label).toLocaleLowerCase().includes(q)).slice(0,50);active=-1;open=true;paint();popup.classList.remove('hidden');input.setAttribute('aria-expanded','true');status.textContent=matches.length ? `${matches.length} customer options. Type to narrow the results.`:'No matching customers.';}
    input.addEventListener('focus',()=>{show();input.select();});
    input.addEventListener('input',(event)=>{if(!event.isComposing)show(input.value);});
    input.addEventListener('compositionend',()=>show(input.value));
    input.addEventListener('keydown',(event)=>{
      if(event.isComposing)return;
      if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();if(!open)show();active=matches.length ? (active+(event.key==='ArrowDown'?1:-1)+matches.length)%matches.length:-1;paint();}
      else if(event.key==='Enter' && open){event.preventDefault();if(active<0 && matches.length)active=0;if(active>=0){choose(matches[active]);close(true);}}
      else if(event.key==='Escape' && open){event.preventDefault();event.stopPropagation();close();}
      else if(event.key==='Tab')close();
    });
    input.addEventListener('blur',()=>{if(!host.contains(document.activeElement))close();});
    toggle.addEventListener('mousedown',(event)=>event.preventDefault());toggle.addEventListener('click',()=>{const wasOpen=open;input.focus();if(wasOpen)close();else show();});
    document.addEventListener('pointerdown',(event)=>{if(open && !host.contains(event.target))close();});
    return {close,show};
  }
  function enhanceSelect(select) {
    if(registry.has(select)){registry.get(select).refresh();return;}
    const input=document.createElement('input');input.id=select.id+'Search';input.type='text';input.placeholder='Search by name or phone...';input.className='customer-select-search';
    const label=select.closest('label');
    input.setAttribute('aria-label',select.id==='orderCustomer'?'Search and select customer':'Search customer accounts');
    input.setAttribute('aria-required',String(select.required));
    if(select.getAttribute('aria-describedby'))input.setAttribute('aria-describedby',select.getAttribute('aria-describedby'));
    if(label)label.htmlFor=input.id;
    select.insertAdjacentElement('afterend',input);select.classList.add('combobox-native');select.tabIndex=-1;select.setAttribute('aria-hidden','true');
    const refresh=()=>{input.value=select.selectedOptions[0]?.textContent || '';};
    mount(input,{items:()=>[...select.options].filter((option)=>!option.disabled).map((option)=>({value:option.value,label:option.textContent})),choose:(item)=>{select.value=item.value;refresh();select.dispatchEvent(new Event('change',{bubbles:true}));},restore:refresh});
    select.addEventListener('change',refresh);registry.set(select,{refresh});refresh();
  }
  function enhanceSearch(input) {
    mount(input,{items:()=>window.LaundryApp.getCustomers().map((customer)=>({label:`${customer.firstName} ${customer.lastName}${customer.phone?' - '+customer.phone:''}`,name:`${customer.firstName} ${customer.lastName}`})),choose:(item)=>{input.value=item.name;input.dispatchEvent(new Event('input',{bubbles:true}));}});
  }
  window.LaundryCustomerCombobox={enhanceSelect,enhanceSearch};
})();
