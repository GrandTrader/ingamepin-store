const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const sharp = require('sharp');
function load(file, extra = {}) {
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true}}).outputText;
  const localRequire = name => name === 'server-only' ? {} : name.startsWith('./') ? load(path.resolve(path.dirname(file), name + '.ts'), extra) : require(name);
  vm.runInNewContext(source, {exports, require: localRequire, URL, Buffer, Uint8Array, process, AbortSignal, fetch, ...extra}, {filename: file});
  return exports;
}
const format = load('lib/product-image-format.ts');
const storage = 'https://example-project.supabase.co';
const imageUrl = storage + '/storage/v1/object/public/store-images/products/test.png';
const image = () => sharp({create:{width:60,height:80,channels:3,background:'#0066aa'}});
const env = {env:{NEXT_PUBLIC_SUPABASE_URL:storage}};
function downloader(mock) { return load('lib/safe-product-image.ts', {fetch:mock,process:env}); }

test('image URLs accept the existing storage paths and reject arbitrary destinations before fetching', async () => {
  let calls = 0;
  const api = downloader(async()=>{calls++;throw Error('Unexpected fetch');});
  for (const url of [imageUrl, '/images/product.png', 'https://res.cloudinary.com/as4zd5aj/image/upload/a.jpg', 'https://image.api.playstation.com/vulcan/ap/image.png']) assert.ok(api.trustedProductImageUrl(url));
  for (const url of ['http://127.0.0.1/a','https://127.0.0.1/a','https://[::1]/a','https://169.254.169.254/a','https://localhost/a','//evil.example/a','https://evil.example/a',storage+'/rest/v1/products',storage+'/storage/v1/object/public/other/a.png',storage+'.evil.example/storage/v1/object/public/store-images/a.png','https://user:pass@res.cloudinary.com/as4zd5aj/image/upload/a','https://res.cloudinary.com:8443/as4zd5aj/image/upload/a','https://res.cloudinary.com/other/image/upload/a','https://res.cloudinary.com/as4zd5aj/image/fetch/https://localhost/a','https://www.ingamepin.com/api/wallet','https://www.ingamepin.com/images/../api/wallet','file:///etc/passwd','data:image/png;base64,a']) await assert.rejects(api.downloadProductImage(url));
  assert.equal(calls,0);
});
test('download forbids redirects, sends no credentials, and preserves valid raster bytes', async () => {
  const png = await image().png().toBuffer();
  const api = downloader(async (url, options) => {
    assert.equal(String(url),imageUrl);assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');assert.equal(options.cache,'no-store');assert.ok(options.signal);
    return new Response(png,{headers:{'content-type':'image/png; charset=binary'}});
  });
  assert.deepEqual(await api.downloadProductImage(imageUrl),png);
  await assert.rejects(downloader(async()=>new Response(null,{status:302,headers:{location:'http://127.0.0.1/'}})).downloadProductImage(imageUrl));
});
test('SVG, HTML, empty content, and misleading raster headers are rejected',async()=>{
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>';
  for(const [body,mime] of [[svg,'image/svg+xml'],[svg,'image/png'],['<html>not an image</html>','image/jpeg'],['','image/png']]) await assert.rejects(downloader(async()=>new Response(body,{headers:{'content-type':mime}})).downloadProductImage(imageUrl));
});
test('oversized declared responses are cancelled without buffering',async()=>{
  let cancelled=false;
  const body=new ReadableStream({cancel(){cancelled=true;}});
  await assert.rejects(downloader(async()=>new Response(body,{headers:{'content-type':'image/png','content-length':String(format.MAX_PRODUCT_IMAGE_BYTES+1)}})).downloadProductImage(imageUrl));
  assert.ok(cancelled);
});
test('chunked and falsely small responses stop at the streaming byte limit',async()=>{
  for(const declared of [undefined,'1']){
    let reads=0,cancelled=false;
    const body=new ReadableStream({pull(controller){reads++;controller.enqueue(new Uint8Array(1024*1024));},cancel(){cancelled=true;}});
    const headers={'content-type':'image/png'};if(declared)headers['content-length']=declared;
    await assert.rejects(downloader(async()=>new Response(body,{headers})).downloadProductImage(imageUrl),/smaller than 10 MB/);
    assert.ok(cancelled);assert.ok(reads<=12,`Read only ${reads} chunks`);
  }
});
test('aborted downloads cancel a stalled body and reject',async()=>{
  const controller=new AbortController();let cancelled=false;
  const body=new ReadableStream({cancel(){cancelled=true;}});
  const pending=downloader(async()=>new Response(body,{headers:{'content-type':'image/png'}})).downloadProductImage(imageUrl,controller.signal);
  setTimeout(()=>controller.abort(),10);
  await assert.rejects(pending);assert.ok(cancelled);
});
test('patched image renderer converts JPG, PNG, WebP and GIF including trusted brand/region overlays',async()=>{
  assert.equal(sharp.versions.sharp,'0.35.5');
  const {renderDigiSellerImage}=load('lib/digiseller-image.ts');
  for(const type of ['jpeg','png','webp','gif']){
    const bytes=await image()[type]().toBuffer();assert.equal(format.assertRasterImage(bytes),'image/'+type);
    const result=await renderDigiSellerImage(bytes,'United States of America');
    const metadata=await sharp(result).metadata();assert.equal(metadata.format,'jpeg');assert.ok(metadata.width>0);assert.ok(metadata.height>metadata.width);
  }
  await assert.rejects(renderDigiSellerImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')),/valid JPG/);
});
test('image upload validates actual bytes before storage access',async()=>{
  let writes=0;
  const upload=load('lib/store-image-upload.ts',{File,require:name=>{
    if(name==='./product-image-format')return format;
    if(name==='node:crypto')return require(name);
    if(name==='@/lib/supabase/admin')return {createAdminClient:()=>({storage:{from:()=>({upload:async()=>{writes++;return {error:null}},getPublicUrl:()=>({data:{publicUrl:imageUrl}})})}})};
    throw Error(name);
  }}).uploadStoreImage;
  await assert.rejects(upload(new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'],'fake.png',{type:'image/png'}),'products'));assert.equal(writes,0);
  assert.equal(await upload(new File([await image().png().toBuffer()],'image.png',{type:'image/png'}),'products'),imageUrl);assert.equal(writes,1);
});
