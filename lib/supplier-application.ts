type SupplierField={name:string;label:string;required:boolean;maxLength:number;placeholder?:string;options?:string[]};
export const supplierFields:SupplierField[]=[
 {name:"supplier_role",label:"Type of supplier",required:true,maxLength:100,options:["Publisher / brand owner","Authorized distributor","Wholesaler / reseller"]},
 {name:"supply_authorization",label:"Supply authorization",required:true,maxLength:100,options:["Direct publisher / brand authorization","Supply through an authorized distributor","Other — explain below"]},
 {name:"authorization_details",label:"Authorization and source of supply",required:true,maxLength:1000,placeholder:"Brands you represent, source of inventory, and authorization documents you can provide on request. Do not include passwords or API keys."},
 {name:"products_brands",label:"Products and brands available",required:true,maxLength:1000,placeholder:"Gift cards, game keys, subscriptions, wallet credits or top-ups; include brands and denominations."},
 {name:"supply_regions",label:"Supported regions and resale restrictions",required:true,maxLength:1000,placeholder:"Countries, currencies and any restrictions on where we may resell or customers may redeem your products."},
 {name:"catalogue_url",label:"Product catalogue or price-list link",required:false,maxLength:500,placeholder:"https://"},
 {name:"wholesale_terms",label:"Wholesale pricing",required:true,maxLength:1000,placeholder:"Pricing or discount structure, quote currency and any volume discounts. State if pricing is available on request."},
 {name:"minimum_order",label:"Minimum order or deposit",required:true,maxLength:500,placeholder:"Minimum order quantity/value, required deposit and currency; enter None if not required."},
 {name:"payment_terms",label:"Payment methods and terms",required:true,maxLength:1000,placeholder:"Accepted payment methods, payment currency, prepayment or credit terms."},
 {name:"delivery_options",label:"Stock availability and delivery",required:true,maxLength:1000,placeholder:"Bulk code files, API or supplier portal; stock availability, delivery times and API documentation link if available."},
 {name:"support_policy",label:"Invalid-code replacement and support",required:true,maxLength:1000,placeholder:"How you handle invalid or redeemed codes, replacement/refund policy and support response times."}
];
