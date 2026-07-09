import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Stock Enquiry — Resolve endpoint
// -----------------------------------------------------------------
// Called by the n8n "Telegram Approval Handler" workflow once you've
// either hit Send on the drafted message as-is, or replied with your
// own wording instead. Marks the line as resolved and hands back
// everything n8n needs to actually send the email - it has no other
// context of its own, since this runs as a completely separate
// execution from the original enquiry (Stephen might approve hours
// or days later).

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  try {
    const apiKey = request.headers.get('x-stock-api-key')
    if (!apiKey || apiKey !== process.env.STOCK_ENQUIRY_API_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const enquirylineid = Number(body?.enquirylineid)
    let finalmessage = (body?.finalmessage || '').trim()
    const status = body?.status === 'Edited' ? 'Edited' : 'Approved'

    if (!enquirylineid) {
      return NextResponse.json({ error: 'enquirylineid is required' }, { status: 400 })
    }
    if (status === 'Edited' && !finalmessage) {
      return NextResponse.json({ error: 'finalmessage is required when status is Edited' }, { status: 400 })
    }

    const { data: line, error: lineErr } = await supabase
      .from('tblstockenquirylines')
      .select('enquirylineid, enquiryid, productid, skurequested, draftmessage')
      .eq('enquirylineid', enquirylineid)
      .maybeSingle()

    if (lineErr || !line) {
      console.error('Stock enquiry resolve — line not found:', lineErr)
      return NextResponse.json({ error: 'Enquiry line not found' }, { status: 404 })
    }

    // Approved with nothing supplied - use the original draft as-is
    if (status === 'Approved' && !finalmessage) {
      finalmessage = line.draftmessage || ''
    }

    const { data: enquiry, error: enquiryErr } = await supabase
      .from('tblstockenquiries')
      .select('customeremail, customername')
      .eq('enquiryid', line.enquiryid)
      .maybeSingle()

    if (enquiryErr || !enquiry) {
      console.error('Stock enquiry resolve — enquiry not found:', enquiryErr)
      return NextResponse.json({ error: 'Enquiry not found' }, { status: 404 })
    }

    let productname: string | null = null
    if (line.productid) {
      const { data: product } = await supabase
        .from('tblproducts')
        .select('productname')
        .eq('productid', line.productid)
        .maybeSingle()
      productname = product?.productname || null
    }

    const { error: updateErr } = await supabase
      .from('tblstockenquirylines')
      .update({
        finalmessage,
        reviewstatus: status,
        sentat: new Date().toISOString(),
      })
      .eq('enquirylineid', enquirylineid)

    if (updateErr) {
      console.error('Stock enquiry resolve — failed to update line:', updateErr)
      return NextResponse.json({ error: 'Failed to update enquiry line' }, { status: 500 })
    }

    return NextResponse.json({
      enquirylineid,
      customeremail: enquiry.customeremail,
      customername: enquiry.customername,
      productname,
      skurequested: line.skurequested,
      finalmessage,
    })
  } catch (err: any) {
    console.error('Stock enquiry resolve — unexpected error:', err)
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 })
  }
}
