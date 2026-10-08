export const PROTECTED_DETAIL = "[Protected account detail]";
export const PROTECTED_REFERENCE = /^protected:([0-9a-f-]{36})$/i;

export function isSensitiveCustomerField(label: string) {
  return /password|passcode|\b2fa\b|\brecovery\b|\bbackup\b|security code|verification code/i.test(label);
}

export function customerDetailDisplay(field: { label: string; value: string }) {
  return isSensitiveCustomerField(field.label) || PROTECTED_REFERENCE.test(field.value)
    ? PROTECTED_DETAIL : field.value;
}
