
content = open('public/register.html', encoding='utf-8').read()

# Fix 1: don't send empty phone
old = "var res=await LV.API.post('/auth/register',{full_name:document.getElementById('full_name').value,email:document.getElementById('email').value,phone:document.getElementById('phone').value,password:p});"
new = """var phone=document.getElementById('phone').value.trim();
    var payload={full_name:document.getElementById('full_name').value.trim(),email:document.getElementById('email').value.trim(),password:p};
    if(phone) payload.phone=phone;
    var res=await LV.API.post('/auth/register',payload);"""
content = content.replace(old, new)

# Fix 2: show proper error message
old2 = "else{alertBox.style.display='block';alertBox.innerHTML='<div class=\"alert-vault alert-vault-danger\"><i class=\"fas fa-exclamation-circle\"></i>'+(res?res.message:'Registration failed')+'</div>';}"
new2 = """else{
      var em='Registration failed. Please check your details.';
      if(res&&res.message) em=res.message;
      else if(res&&res.errors&&res.errors.length) em=res.errors.map(function(e){return e.msg;}).join('. ');
      alertBox.style.display='block';
      alertBox.innerHTML='<div class="alert-vault alert-vault-danger"><i class="fas fa-exclamation-circle me-2"></i>'+em+'</div>';
    }"""
content = content.replace(old2, new2)

open('public/register.html', 'w', encoding='utf-8').write(content)
print('register.html fixed successfully')
