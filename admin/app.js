import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const supabase = createClient(
  'https://mbjgirwuqzcjrllnokzj.supabase.co',
  'sb_publishable_gEivTgSBsntxUkkJc3h9AA_-cmDpszh'
);
const $ = (id) => document.getElementById(id);
const statusNames = {new:'جديد',under_review:'قيد المراجعة',accepted:'مقبول',rejected:'مرفوض',completed:'مكتمل',cancelled:'ملغى'};
let session = null, profile = null, vehicles = [], photos = [], bookings = [], customers = [], tab = 'vehicles';
const PHOTO_BUCKET = 'boukili-car-photos';
let photoItems = [], mainPhotoKey = null;
const money = v => new Intl.NumberFormat('fr-MA',{maximumFractionDigits:0}).format(Number(v||0))+' MAD';
const phoneClean = s => String(s||'').replace(/[^0-9+]/g,'');
const dateText = s => s ? new Date(s).toLocaleString('fr-MA',{dateStyle:'medium',timeStyle:'short'}) : '—';
function notice(msg){ $('notice').textContent=msg; $('notice').classList.remove('hidden'); setTimeout(()=>$('notice').classList.add('hidden'),6500); }
function showLogin(){ $('loginView').classList.remove('hidden'); $('appView').classList.add('hidden'); }
function showApp(){ $('loginView').classList.add('hidden'); $('appView').classList.remove('hidden'); $('userEmail').textContent=session?.user?.email||''; }
async function checkSession(){
  const {data:{session:s}} = await supabase.auth.getSession(); session=s;
  if(!session){showLogin();return;}
  const {data,error}=await supabase.from('profiles').select('id,role,full_name').eq('id',session.user.id).single();
  if(error || !['admin','manager'].includes(data?.role)){ await supabase.auth.signOut(); $('loginError').textContent='الحساب ما عندوش صلاحية Admin أو Manager.'; showLogin(); return; }
  profile=data; showApp(); await loadAll();
}
$('loginForm').addEventListener('submit',async e=>{
  e.preventDefault(); $('loginError').textContent='';
  const {error}=await supabase.auth.signInWithPassword({email:$('email').value,password:$('password').value});
  if(error){$('loginError').textContent=error.message;return;} await checkSession();
});
$('logout').addEventListener('click',async()=>{await supabase.auth.signOut();session=null;showLogin();});
supabase.auth.onAuthStateChange((_event,s)=>{session=s;if(!s)showLogin();});
$('year').textContent=new Date().getFullYear();

async function loadAll(){
  const [v,p,b,c]=await Promise.all([
    supabase.from('boukili_vehicles').select('*').order('created_at',{ascending:false}),
    supabase.from('boukili_vehicle_photos').select('*').order('sort_order'),
    supabase.from('boukili_bookings').select('*,boukili_customers(full_name,phone,email),boukili_vehicles(brand,model)').order('created_at',{ascending:false}),
    supabase.from('boukili_customers').select('*').order('created_at',{ascending:false})
  ]);
  const err=[v,p,b,c].find(x=>x.error)?.error;if(err)notice(err.message);
  vehicles=v.data||[];photos=p.data||[];bookings=b.data||[];customers=c.data||[];
  renderVehicles();renderBookings();renderCustomers();
  $('newCount').textContent=bookings.filter(x=>x.status==='new').length||'';
  $('totalVehicles').textContent=vehicles.length;$('visibleVehicles').textContent=vehicles.filter(x=>x.is_published).length;$('offVehicles').textContent=vehicles.filter(x=>x.availability_status==='out_of_service').length;
  $('newBookings').textContent=bookings.filter(x=>x.status==='new').length;
  $('pendingBookings').textContent=bookings.filter(x=>['new','under_review'].includes(x.status)).length;
  $('acceptedBookings').textContent=bookings.filter(x=>x.status==='accepted').length;
}
function renderVehicles(){
  const q=$('vehicleSearch').value.toLowerCase(),f=$('vehicleFilter').value;
  const list=vehicles.filter(v=>(v.brand+' '+v.model+' '+(v.registration_plate||'')).toLowerCase().includes(q)&&(f==='all'||(f==='published'&&v.is_published)||(f==='hidden'&&!v.is_published)||(f===v.availability_status)));
  $('vehicleGrid').innerHTML=list.length?list.map(v=>{
    const p=photos.find(x=>x.vehicle_id===v.id&&x.is_main)||photos.find(x=>x.vehicle_id===v.id);
    return `<article class="car-card"><div class="car-photo">${p?'<img src="'+esc(p.photo_url)+'" alt="">':'<span>PHOTO DU VÉHICULE</span>'}<span>${v.availability_status==='available'?'Disponible':'Hors service'}</span></div><div class="car-body"><div class="car-title"><div><h3>${esc(v.brand)} ${esc(v.model)}</h3><small>${v.year||'—'} · ${esc(v.color||'—')}</small></div><strong>${money(v.daily_price)}<small>/ jour</small></strong></div><div class="specs">${esc(v.fuel||'—')} · ${esc(v.transmission||'—')} · ${v.seats||'—'} places</div><div class="car-actions"><small>${v.is_published?'● En ligne':'○ Masquée'}</small><div class="actions"><button data-publish="${v.id}" title="Visibilité">${v.is_published?'Masquer':'Afficher'}</button><button data-edit="${v.id}">Modifier</button><button class="delete" data-delete="${v.id}">Supprimer</button></div></div></div></article>`;
  }).join(''):'<div class="empty">Aucun véhicule trouvé.</div>';
}
function renderBookings(){
  $('bookingRows').innerHTML=bookings.length?bookings.map(b=>`<tr><td><b>${esc(b.boukili_customers?.full_name||'Client')}</b><small>${esc(b.boukili_customers?.phone||'—')}</small></td><td>${esc(b.boukili_vehicles?.brand||'')} ${esc(b.boukili_vehicles?.model||'')}</td><td>${dateText(b.start_at)}<small>au ${dateText(b.end_at)}</small></td><td>${esc(b.pickup_city||'—')}<small>${esc(b.pickup_location||'')}</small></td><td>${b.source==='whatsapp'?'WhatsApp':'Site web'}</td><td><span class="status ${b.status}">${statusNames[b.status]||b.status}</span></td><td><select class="status-edit" data-status="${b.id}"><option value="new" ${b.status==='new'?'selected':''}>Nouveau</option><option value="under_review" ${b.status==='under_review'?'selected':''}>En revue</option><option value="accepted" ${b.status==='accepted'?'selected':''}>Accepter</option><option value="rejected" ${b.status==='rejected'?'selected':''}>Refuser</option><option value="completed" ${b.status==='completed'?'selected':''}>Terminer</option><option value="cancelled" ${b.status==='cancelled'?'selected':''}>Annuler</option></select></td></tr>`).join(''):'<tr><td colspan="7" class="empty">Aucune demande de réservation.</td></tr>';
}
function renderCustomers(){
  const q=$('customerSearch').value.toLowerCase();
  const list=customers.filter(c=>(c.full_name+' '+c.phone+' '+(c.email||'')).toLowerCase().includes(q));
  $('customerRows').innerHTML=list.map(c=>`<tr><td><b>${esc(c.full_name)}</b></td><td><a class="phone" target="_blank" rel="noreferrer" href="https://wa.me/${phoneClean(c.phone).replace(/^\+/,'')}">${esc(c.phone)}</a></td><td>${esc(c.email||'—')}</td><td>${bookings.filter(b=>b.customer_id===c.id).length}</td><td>${new Date(c.created_at).toLocaleDateString('fr-MA')}</td></tr>`).join('')||'<tr><td colspan="5" class="empty">Aucun client.</td></tr>';
}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function selectTab(next){
  tab=next;document.querySelectorAll('.nav').forEach(b=>b.classList.toggle('active',b.dataset.tab===next));
  ['vehicles','bookings','customers'].forEach(t=>$(t+'Tab').classList.toggle('hidden',t!==next));
  $('pageTitle').textContent=({vehicles:'Flotte automobile',bookings:'Réservations',customers:'Clients'})[next];
}
document.querySelectorAll('.nav').forEach(b=>b.addEventListener('click',()=>selectTab(b.dataset.tab)));
$('refresh').addEventListener('click',loadAll);
$('vehicleSearch').addEventListener('input',renderVehicles);$('vehicleFilter').addEventListener('change',renderVehicles);$('customerSearch').addEventListener('input',renderCustomers);
function clearPhotoPreviews(){
  photoItems.forEach(p=>{if(p.file && p.previewUrl)URL.revokeObjectURL(p.previewUrl);});
  photoItems=[];mainPhotoKey=null;
  if($('photo_files'))$('photo_files').value='';
  renderPhotoPreviews();
}
function renderPhotoPreviews(){
  const host=$('photoPreviewList');if(!host)return;
  host.innerHTML=photoItems.map((p,i)=>`<div class="photo-preview">
    <img src="${esc(p.previewUrl||p.url)}" alt="Photo ${i+1}">
    <div class="photo-preview-actions">
      <label><input type="radio" name="mainPhoto" value="${esc(p.key)}" ${mainPhotoKey===p.key?'checked':''}> Principale</label>
      <button type="button" data-remove-photo="${esc(p.key)}" aria-label="Supprimer la photo">×</button>
    </div>
  </div>`).join('');
}
$('photo_files').addEventListener('change',e=>{
  const files=[...e.target.files||[]];
  for(const file of files){
    if(!file.type.startsWith('image/')){notice('اختار غير ملفات الصور.');continue;}
    if(file.size>10*1024*1024){notice('كل صورة خاصها تكون أقل من 10 MB.');continue;}
    const key='new-'+crypto.randomUUID();
    photoItems.push({key,file,previewUrl:URL.createObjectURL(file),isNew:true});
    if(!mainPhotoKey)mainPhotoKey=key;
  }
  e.target.value='';renderPhotoPreviews();
});
$('photoPreviewList').addEventListener('change',e=>{
  if(e.target.name==='mainPhoto'){mainPhotoKey=e.target.value;renderPhotoPreviews();}
});
$('photoPreviewList').addEventListener('click',e=>{
  const btn=e.target.closest('[data-remove-photo]');if(!btn)return;
  const key=btn.dataset.removePhoto, item=photoItems.find(p=>p.key===key);
  if(item?.file&&item.previewUrl)URL.revokeObjectURL(item.previewUrl);
  photoItems=photoItems.filter(p=>p.key!==key);
  if(mainPhotoKey===key)mainPhotoKey=photoItems[0]?.key||null;
  renderPhotoPreviews();
});
function resetVehicleForm(){
  $('vehicleForm').reset();clearPhotoPreviews();$('vehicleId').value='';$('seats').value=5;$('doors').value=4;$('is_published').checked=true;$('vehicleDialogTitle').textContent='Ajouter un véhicule';
}
function openVehicle(v){
  resetVehicleForm();
  if(v){$('vehicleDialogTitle').textContent='Modifier le véhicule';$('vehicleId').value=v.id;
    ['brand','model','year','daily_price','fuel','transmission','seats','doors','color','registration_plate','availability_status','description'].forEach(k=>$(k).value=v[k]??'');
    $('is_published').checked=!!v.is_published;
    photoItems=photos.filter(p=>p.vehicle_id===v.id).sort((a,b)=>a.sort_order-b.sort_order).map(p=>({key:'old-'+p.id,url:p.photo_url,isNew:false,recordId:p.id}));
    mainPhotoKey=photoItems.find(p=>photos.find(x=>x.id===p.recordId)?.is_main)?.key||photoItems[0]?.key||null;
    renderPhotoPreviews();
  }
  $('vehicleDialog').showModal();
}
$('addVehicle').addEventListener('click',()=>openVehicle(null));
$('vehicleGrid').addEventListener('click',async e=>{
  const edit=e.target.closest('[data-edit]'),del=e.target.closest('[data-delete]'),pub=e.target.closest('[data-publish]');
  if(edit){openVehicle(vehicles.find(v=>v.id===edit.dataset.edit));return;}
  if(del){const v=vehicles.find(x=>x.id===del.dataset.delete);if(!confirm('حذف '+v.brand+' '+v.model+'؟'))return;const {error}=await supabase.from('boukili_vehicles').delete().eq('id',v.id);notice(error?error.message:'تم حذف السيارة.');await loadAll();return;}
  if(pub){const v=vehicles.find(x=>x.id===pub.dataset.publish);const {error}=await supabase.from('boukili_vehicles').update({is_published:!v.is_published,updated_at:new Date().toISOString()}).eq('id',v.id);notice(error?error.message:'تحدّث الظهور فالموقع.');await loadAll();}
});
$('vehicleForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const saveBtn=$('vehicleForm').querySelector('button[type="submit"],.dialog-actions .btn.dark');
  saveBtn.disabled=true;saveBtn.textContent='Enregistrement…';
  try{
    const id=$('vehicleId').value;
    const data={brand:$('brand').value.trim(),model:$('model').value.trim(),year:$('year').value?Number($('year').value):null,daily_price:Number($('daily_price').value),fuel:$('fuel').value,transmission:$('transmission').value,seats:Number($('seats').value||5),doors:Number($('doors').value||4),color:$('color').value,registration_plate:$('registration_plate').value,availability_status:$('availability_status').value,is_published:$('is_published').checked,description:$('description').value,updated_at:new Date().toISOString()};
    const result=id?await supabase.from('boukili_vehicles').update(data).eq('id',id).select().single():await supabase.from('boukili_vehicles').insert(data).select().single();
    if(result.error)throw result.error;
    const vehicleId=result.data.id, previous=photos.filter(p=>p.vehicle_id===vehicleId);
    const finalItems=[];
    for(const item of photoItems){
      if(item.isNew){
        const ext=(item.file.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'')||'jpg';
        const path=vehicleId+'/'+crypto.randomUUID()+'.'+ext;
        const {error:uploadError}=await supabase.storage.from(PHOTO_BUCKET).upload(path,item.file,{cacheControl:'31536000',contentType:item.file.type,upsert:false});
        if(uploadError)throw uploadError;
        const {data:publicData}=supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path);
        finalItems.push({key:item.key,url:publicData.publicUrl});
      }else finalItems.push({key:item.key,url:item.url});
    }
    const del=await supabase.from('boukili_vehicle_photos').delete().eq('vehicle_id',vehicleId);
    if(del.error)throw del.error;
    if(finalItems.length){
      const rows=finalItems.map((p,i)=>({vehicle_id:vehicleId,photo_url:p.url,is_main:p.key===mainPhotoKey,sort_order:i}));
      const ins=await supabase.from('boukili_vehicle_photos').insert(rows);
      if(ins.error)throw ins.error;
    }
    const keptUrls=new Set(finalItems.map(p=>p.url));
    const storagePrefix='https://mbjgirwuqzcjrllnokzj.supabase.co/storage/v1/object/public/'+PHOTO_BUCKET+'/';
    const obsolete=previous.map(p=>p.photo_url).filter(url=>url.startsWith(storagePrefix)&&!keptUrls.has(url)).map(url=>decodeURIComponent(url.slice(storagePrefix.length)));
    if(obsolete.length)await supabase.storage.from(PHOTO_BUCKET).remove(obsolete);
    $('vehicleDialog').close();notice('تم حفظ السيارة والصور بنجاح.');await loadAll();
  }catch(err){notice('تعذر الحفظ: '+(err.message||'خطأ غير معروف'));}
  finally{saveBtn.disabled=false;saveBtn.textContent='Enregistrer';}
});
$('addBooking').addEventListener('click',()=>{
  $('bookingForm').reset();
  $('booking_vehicle').innerHTML='<option value="">اختار السيارة</option>'+vehicles.map(v=>'<option value="'+v.id+'">'+esc(v.brand+' '+v.model)+' — '+money(v.daily_price)+'/jour</option>').join('');
  $('bookingDialog').showModal();
});
$('bookingForm').addEventListener('submit',async e=>{
  e.preventDefault();const phone=phoneClean($('client_phone').value);
  let customer=customers.find(c=>phoneClean(c.phone)===phone);
  if(!customer){const r=await supabase.from('boukili_customers').insert({full_name:$('client_name').value.trim(),phone}).select().single();if(r.error){notice(r.error.message);return;}customer=r.data;}
  const start=new Date($('start_at').value),end=new Date($('end_at').value);
  if(!(end>start)){notice('تاريخ الرجوع خاصو يكون من بعد تاريخ الانطلاق.');return;}
  const {error}=await supabase.from('boukili_bookings').insert({customer_id:customer.id,vehicle_id:$('booking_vehicle').value,start_at:start.toISOString(),end_at:end.toISOString(),pickup_city:$('pickup_city').value,pickup_location:$('pickup_location').value,source:'whatsapp',status:'new',customer_message:$('customer_message').value});
  if(error){notice(error.message);return;}
  $('bookingDialog').close();notice('تسجل الطلب. السيارة ما كتتحجزش حتى تقبل الطلب.');await loadAll();
});
$('bookingRows').addEventListener('change',async e=>{
  const id=e.target.dataset.status;if(!id)return;
  const {error}=await supabase.from('boukili_bookings').update({status:e.target.value,updated_at:new Date().toISOString()}).eq('id',id);
  if(error)notice(error.message.includes('exclusion')||error.message.includes('overlap')?'السيارة محجوزة فهاد الفترة. اختار تاريخ آخر.':error.message);
  else notice('تحدّثت حالة الحجز.');await loadAll();
});
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
checkSession();