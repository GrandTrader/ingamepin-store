const fs=require("node:fs");
const ts=require("typescript");
const test=require("node:test");
const assert=require("node:assert/strict");
function field(categoryImage={name:"Xbox",url:"https://example.com/xbox.png"}) {
 const state=[];let cursor=0;
 const hooks={
  useState(initial){const index=cursor++;if(!(index in state))state[index]=initial;return[state[index],value=>{state[index]=value}]},
  useRef(initial){return hooks.useState({current:initial})[0]},
  useEffect(){}
 };
 const mod={exports:{}};
 new Function("exports","require","module",ts.transpileModule(fs.readFileSync("components/ResponsiveImageField.tsx","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText)(mod.exports,name=>name==="react"?hooks:require(name),mod);
 let elements;
 function visit(node){if(!node||typeof node!=="object")return;if(Array.isArray(node)){node.forEach(visit);return}elements.push(node);visit(node.props?.children)}
 function render(){cursor=0;elements=[];visit(mod.exports.default({label:"Product image",name:"image_url",fileName:"image_file",variant:"product",defaultValue:"https://example.com/original.png",categoryImage}));}
 function find(type,predicate=()=>true){return elements.find(el=>el.type===type&&predicate(el.props))}
 render();const nativeInput={value:""};find("input",p=>p.type==="file").props.ref.current=nativeInput;
 return{render,find,nativeInput};
}
test("category image selection clears an earlier upload and submits the category URL",()=>{
 const f=field();const file=new File(["image"],"custom.png",{type:"image/png"});
 f.nativeInput.value="custom.png";f.find("input",p=>p.type==="file").props.onChange({target:{files:[file]}});f.render();
 const preview=f.find("img",p=>p.alt==="Image preview").props.src;assert.match(preview,/^blob:/);
 f.find("button").props.onClick();f.render();
 assert.equal(f.nativeInput.value,"");
 assert.equal(f.find("input",p=>p.type==="url").props.value,"https://example.com/xbox.png");
 assert.equal(f.find("img",p=>p.alt==="Image preview").props.src,"https://example.com/xbox.png");
 assert.equal(f.find("button").props["aria-pressed"],true);
 URL.revokeObjectURL(preview);
});
test("manual file upload can replace a selected category image",()=>{
 const f=field();f.find("button").props.onClick();f.render();
 f.find("input",p=>p.type==="file").props.onChange({target:{files:[new File(["x"],"manual.png",{type:"image/png"})]}});f.render();
 assert.equal(f.find("input",p=>p.type==="url").props.value,"");
 assert.equal(f.find("button").props["aria-pressed"],false);
 const preview=f.find("img",p=>p.alt==="Image preview").props.src;assert.match(preview,/^blob:/);URL.revokeObjectURL(preview);
});
test("pasting a URL also clears a previously chosen upload",()=>{
 const f=field();f.nativeInput.value="old.png";
 f.find("input",p=>p.type==="url").props.onChange({target:{value:"https://example.com/manual.jpg"}});f.render();
 assert.equal(f.nativeInput.value,"");
 assert.equal(f.find("img",p=>p.alt==="Image preview").props.src,"https://example.com/manual.jpg");
});
test("missing category image disables reuse while manual input remains available",()=>{
 const f=field({name:"Xbox",url:null});
 assert.equal(f.find("button").props.disabled,true);
 assert.ok(f.find("input",p=>p.type==="file"));
 assert.ok(f.find("input",p=>p.type==="url"));
});

