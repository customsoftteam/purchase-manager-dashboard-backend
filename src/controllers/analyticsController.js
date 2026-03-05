// Purchase manager analytics controller
const supabase = require('../config/supabase');

const getCount = async (table, filters = []) => {
  let query = supabase.from(table).select('*', { count: 'exact', head: true });
  filters.forEach((filter) => {
    query = query[filter.method](filter.column, filter.value);
  });
  const { count, error } = await query;
  if (error) throw error;
  return count || 0;
};

const getDistinctEnquiryCount = async (filters = []) => {
  let query = supabase.from('purchase_enquiry').select('enquiry_id');
  filters.forEach((filter) => {
    query = query[filter.method](filter.column, filter.value);
  });

  let { data, error } = await query;

  if (error) throw error;
  const unique = new Set((data || []).map((row) => row.enquiry_id).filter(Boolean));
  return unique.size;
};

// Purchase manager analytics summary
exports.getPurchaseManagerAnalytics = async (req, res) => {
  try {
    const currentYear = new Date().getFullYear();
    const yearStart = new Date(currentYear, 0, 1).toISOString();

    const [
      rfqRaised,
      rfqAnswered,
      quotationsReceived,
      loisSent,
      invoicesReceived,
      invoicesPending,
      paymentOrdersCount,
      paymentsAmount,
      vendorsConnected,
    ] = await Promise.all([
      getDistinctEnquiryCount(),
      getDistinctEnquiryCount([{ method: 'neq', column: 'status', value: 'pending' }]),
      getCount('purchase_quotation'),
      getCount('purchase_loi'),
      getCount('vendor_invoice'),
      getCount('vendor_invoice', [{ method: 'in', column: 'status', value: ['pending', 'received'] }]),
      getCount('purchase_payment'),
      supabase.from('purchase_payment').select('amount').then(({ data, error }) => {
        if (error) throw error;
        return (data || []).reduce((sum, row) => sum + (parseFloat(row.amount) || 0), 0);
      }),
      getCount('vendorregistration', [{ method: 'eq', column: 'status', value: 'approved' }]),
    ]);

    const { data: orderItems, error: itemsError } = await supabase
      .from('purchase_order_items')
      .select('quantity, created_at')
      .gte('created_at', yearStart);

    if (itemsError) throw itemsError;

    const componentsPurchased = (orderItems || []).reduce(
      (sum, item) => sum + (parseFloat(item.quantity) || 0),
      0
    );

    res.json({
      rfqRaised,
      rfqAnswered,
      quotationsReceived,
      loisSent,
      invoicesReceived,
      invoicesPending,
      paymentOrdersCount,
      paymentsAmount,
      vendorsConnected,
      componentsPurchased,
      year: currentYear,
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch analytics' });
  }
};
