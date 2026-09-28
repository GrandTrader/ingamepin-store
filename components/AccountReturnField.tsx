"use client";
import { usePathname } from "next/navigation";
import { isBusinessPortalPath } from "@/lib/portal-navigation";
export default function AccountReturnField({area="profile"}:{area?:"profile"|"wallet"}){return <input type="hidden" name="return_to" value={isBusinessPortalPath(usePathname())?`/account/portal/${area}`:`/account/${area}`}/>;}
