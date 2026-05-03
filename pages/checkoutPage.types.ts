/** Shared type used by CheckoutPage and testData. */
export interface ShippingDetails {
  firstName:     string;
  lastName:      string;
  zipCode:       string;
  // Extended — used by automationexercise.com and API mocks only
  email?:        string;
  phone?:        string;
  addressLine1?: string;
  addressLine2?: string;
  city?:         string;
  state?:        string;
  country?:      string;
}

export interface PaymentDetails {
  cardNumber:  string;
  cardHolder:  string;
  expiryMonth: string;
  expiryYear:  string;
  cvv:         string;
  last4?:      string;
}
