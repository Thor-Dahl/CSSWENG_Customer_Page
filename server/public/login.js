document.getElementById('loginForm').addEventListener('submit',async(event)=>{
  event.preventDefault();const button=document.getElementById('signIn'),error=document.getElementById('loginError');error.classList.add('hidden');button.disabled=true;
  try {
    const response=await fetch('/api/auth/login',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:document.getElementById('username').value.trim(),password:document.getElementById('password').value})});
    const result=await response.json();if(!response.ok)throw new Error(result.error||'Sign-in failed.');location.replace('/');
  }catch(problem){error.textContent=problem.message||'Cannot reach the server.';error.classList.remove('hidden');document.getElementById('username').focus();}finally{button.disabled=false;}
});
