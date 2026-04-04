// PickFlow — Database Types
// Generated from schema v3.1 + pricing updates
// Keep in sync with Supabase schema

export type Product = {
  productid: number
  sku: string
  productname: string
  description: string | null
  category: string | null
  subcategory: string | null
  brand: string | null
  unitofmeasure: string | null
  barcode: string | null
  salesprice: number              // overrides price band if set
  wholesaleprice: number          // overrides price band if set
  reducedwholesaleprice: number   // overrides price band if set
  pricingcode: string | null      // reference to tblpricingcodes.pricingcode
  vatstatus: 'Standard' | 'Zero' | 'Exempt'
  weight: number | null           // grams
  width: number | null
  height: number | null
  depth: number | null
  reorderlevel: number
  reorderqty: number
  leadtimedays: number
  isactive: boolean
  isdropship: boolean
  pickingbintracked: boolean
  bagsizedefault: number
  productnotes: string | null
  productimagepath: string | null
  dateadded: string | null
  lastmodified: string | null
}

export type PricingCode = {
  pricingcodeid: number
  pricingcode: string
  description: string | null
  salesprice: number
  wholesaleprice: number
  reducedwholesaleprice: number
  isactive: boolean
}

export type Category = {
  categoryid: number
  categoryname: string
}

export type SubCategory = {
  subcategoryid: number
  categoryid: number
  subcategoryname: string
}

export type Location = {
  locationid: number
  locationcode: string
  locationname: string | null
  locationtype: string | null
  zone: string | null
  isactive: boolean
  notes: string | null
}

export type StockLevel = {
  stocklevelid: number
  productid: number
  locationid: number
  quantityonhand: number
  bagsize: number
  pickpriority: number
  lastcountdate: string | null
  lastcountby: string | null
  batchid: number | null
  notes: string | null
}

export type Supplier = {
  supplierid: number
  suppliername: string
  contactname: string | null
  email: string | null
  phone: string | null
  address1: string | null
  address2: string | null
  town: string | null
  county: string | null
  postcode: string | null
  country: string
  paymentterms: string | null
  leadtimedays: number | null
  accountref: string | null
  isactive: boolean
  notes: string | null
}

export type Client = {
  clientid: number
  clientcode: string | null
  companyname: string | null
  firstname: string | null
  lastname: string | null
  email: string | null
  phone: string | null
  address1: string | null
  address2: string | null
  address3: string | null
  town: string | null
  county: string | null
  postcode: string | null
  country: string
  source: string | null
  isreducedwholesale: boolean
  defaultblindship: boolean
  clientlogopath: string | null
  isactive: boolean
  dateadded: string | null
  notes: string | null
}

export type ClientPricing = {
  clientpricingid: number
  clientid: number
  pricingtype: string | null      // 'Fixed Product' | 'Fixed Category' | 'Fixed PriceBand' | 'Percentage Discount'
  productid: number | null
  categoryid: number | null
  pricingcode: string | null      // for price band fixed pricing by code
  fixedprice: number | null
  discountpercent: number
  isactive: boolean
  notes: string | null
}

export type Order = {
  orderid: number
  ordernumber: string | null
  clientid: number
  orderdate: string | null
  requireddate: string | null
  ordersource: string | null
  externalorderref: string | null
  status: 'New' | 'Picking' | 'Packed' | 'Despatched' | 'Cancelled'
  isblindship: boolean
  shiptoname: string | null
  shiptoaddress1: string | null
  shiptoaddress2: string | null
  shiptoaddress3: string | null
  shiptotown: string | null
  shiptocounty: string | null
  shiptopostcode: string | null
  shiptocountry: string
  shippingmethod: string | null
  trackingnumber: string | null
  despatchdate: string | null
  subtotal: number
  productvat: number
  shippingvat: number
  totalvat: number
  shippingcost: number
  ordertotal: number
  ordertotalincvat: number
  totalweightg: number
  notes: string | null
  createdby: string | null
}

export type OrderLine = {
  orderlineid: number
  orderid: number
  productid: number | null
  bundleid: number | null
  backorderid: number | null
  sku: string | null
  productname: string | null
  quantityordered: number
  quantitypicked: number
  unitprice: number
  linetotal: number
  vatstatus: 'Standard' | 'Zero' | 'Exempt'
  vatrate: number
  vatamount: number
  linetotalincvat: number
  status: 'Pending' | 'Picked' | 'Cancelled'
  notes: string | null
}

export type ShippingRate = {
  shippingrateid: number
  methodname: string
  carrier: string | null
  price: number
  isactive: boolean
  displayorder: number
  minweightg: number | null
  maxweightg: number | null
  servicecode: string | null
  notes: string | null
}

export type AppSetting = {
  settingid: number
  settingkey: string
  settingvalue: string | null
  description: string | null
  iseditable: boolean
  lastmodified: string | null
  modifiedby: string | null
}

export type Role = {
  roleid: number
  rolename: string
  description: string | null
  canaccessadmin: boolean
  caneditorders: boolean
  caneditstock: boolean
  caneditproducts: boolean
  caneditclients: boolean
  caneditsuppliers: boolean
  canimport: boolean
  canexport: boolean
  canprintreports: boolean
  canviewreports: boolean
}
