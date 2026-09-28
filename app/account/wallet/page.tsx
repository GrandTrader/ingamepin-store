import WalletContent from "./WalletContent";
export const dynamic="force-dynamic";
export default function Page(props:{searchParams:Promise<{error?:string;success?:string;page?:string}>}){return <WalletContent {...props}/>;}
