const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
const {renderToStaticMarkup} = require('react-dom/server');
function load(file, imports = {}) {
  const mod = {exports:{}};
  new Function('exports','require','module',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText)(mod.exports,name=>name in imports?imports[name]:require(name),mod);
  return mod.exports;
}
const logic = load('lib/admin-order-display.ts');
const item = (id,extra={}) => ({id,product_id:'apple',product_option_id:id,product_name:'Apple India',option_name:'100 INR',denomination:100,platform:null,fulfillment_mode:null,player_id:null,customer_information:[],quantity:10,affiliate_commission_percent:0,products:{delivery_type:'AUTOMATIC'},...extra});
test('groups denominations by product identity without losing line quantities or account details',()=>{
  const rows=[item('one'),item('two',{quantity:20,customer_information:[{fieldId:'account',label:'Username',value:'customer'}]}),item('three',{product_id:'other',quantity:2})];
  const groups=logic.groupOrderItems(rows);
  assert.equal(groups.length,2);assert.equal(groups[0].quantity,30);assert.equal(groups[1].quantity,2);
  assert.deepEqual(groups[0].items,rows.slice(0,2));assert.equal(rows.length,3);
});
test('manual ranges override automatic products and mixed delivery remains explicit',()=>{
  assert.equal(logic.orderDeliveryLabel([item('1',{fulfillment_mode:'RANGE_MANUAL'})]),'Manual delivery');
  assert.equal(logic.orderDeliveryLabel([item('1',{fulfillment_mode:'RANGE_SUPPLIER'})]),'Supplier delivery');
  assert.equal(logic.orderDeliveryLabel([item('1'),item('2',{products:[{delivery_type:'MANUAL'}]})]),'Mixed delivery');
  assert.equal(logic.orderDeliveryLabel([item('1',{products:null})]),null);
  assert.equal(logic.orderDeliveryLabel([]),null);
});
test('all original item details remain available without exposing protected customer data',()=>{
  const link = ({children,prefetch,...props})=>React.createElement('a',props,children);
  const List = load('app/admin/orders/AdminOrdersList.tsx',{
    '@/components/NavigationLink':{default:link},
    '../AdminOrderLink':{default:({orderId,orderNumber,className})=>React.createElement('a',{href:'/admin/orders/'+orderId+'/receipt',className},orderNumber)},
    '@/lib/admin-order-display':logic,
    '@/lib/sensitive-customer-fields':load('lib/sensitive-customer-fields.ts'),
    './Orders.module.css':{default:new Proxy({},{get:(_,key)=>key})},
  }).default;
  const order={id:'test',order_number:'IP20261019001',customer_name:'Example',customer_email:'customer@example.com',status:'PROCESSING',total:100,currency:'USD',created_at:'2026-10-19T00:00:00Z',paid_at:null,delivered_at:null,order_items:[item('one',{platform:'PlayStation',player_id:'12345',affiliate_commission_percent:3,customer_information:[{fieldId:'password',label:'Password',value:'secret-never-render'},{fieldId:'account',label:'Username',value:'public-customer'}]}),item('two')]};
  const html=renderToStaticMarkup(React.createElement(List,{orders:[order],customerIds:new Map([['customer@example.com','customer-id']])}));
  assert.match(html,/<details/);assert.doesNotMatch(html,/<details[^>]* open/);
  for(const text of ['Qty 20','PlayStation','12345','Affiliate sale','public-customer','Protected account detail','/admin/customers/customer-id','/admin/orders/test/receipt','5:30'])assert.ok(html.includes(text),text);
  assert.doesNotMatch(html,/secret-never-render/);assert.equal((html.match(/class="denomination"/g)||[]).length,2);
});
