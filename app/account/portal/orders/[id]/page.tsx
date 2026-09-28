import Content from "@/app/account/orders/OrderReceipt";
import {portalCustomer} from "@/lib/business-portal-data";
export const dynamic="force-dynamic";
export default async function Page(props: {params:Promise<{id:string}>}) {await portalCustomer();return <Content {...props} portal/>;}
