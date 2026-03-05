// Purchase enquiry controller
const supabase = require('../config/supabase');
const { v4: uuidv4 } = require('uuid');

const getMissingColumnFromError = (error) => {
  const message = error?.message || '';
  const match = message.match(/Could not find the '([^']+)' column/);
  return match?.[1] || null;
};

const stripColumnFromRows = (rows, columnName) => rows.map((row) => {
  const next = { ...row };
  delete next[columnName];
  return next;
});

const stripColumnFromObject = (row, columnName) => {
  const next = { ...row };
  delete next[columnName];
  return next;
};

const insertWithColumnFallback = async (table, rows) => {
  let payload = rows;

  while (true) {
    const { data, error } = await supabase.from(table).insert(payload);
    if (!error) return { data, error: null };

    const missingColumn = getMissingColumnFromError(error);
    if (!missingColumn) return { data: null, error };

    payload = stripColumnFromRows(payload, missingColumn);
  }
};

const insertSingleWithColumnFallback = async (table, row) => {
  let payload = { ...row };

  while (true) {
    const { data, error } = await supabase.from(table).insert([payload]).select().maybeSingle();
    if (!error) return { data, error: null };

    const missingColumn = getMissingColumnFromError(error);
    if (!missingColumn) return { data: null, error };

    payload = stripColumnFromObject(payload, missingColumn);
  }
};

const updateWithColumnFallback = async (table, whereColumn, whereValue, updateData) => {
  let payload = { ...updateData };

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .update(payload)
      .eq(whereColumn, whereValue)
      .select();

    if (!error) return { data, error: null };

    const missingColumn = getMissingColumnFromError(error);
    if (!missingColumn) return { data: null, error };

    delete payload[missingColumn];
  }
};

const buildEnquiryIdPrefix = (vendorId) => {
  const cleanVendor = String(vendorId || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
  return `pe_${cleanVendor}_`;
};

const parseOptionalNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed > 0 ? parsed : null;
};

const normalizeEnquiryItems = (rawItems = []) => {
  if (!Array.isArray(rawItems)) return [];

  return rawItems
    .map((item) => {
      const component_id = item.component_id || item.componentId || item.componentid || null;
      const quantity = Number(item.quantity);
      const unit = item.unit || null;
      const specifications = item.specifications || item.specification || null;
      const component_name = item.component_name || item.name || null;
      const estimated_unit_cost = parseOptionalNumber(item.estimated_unit_cost ?? item.unit_price ?? item.unitPrice);
      const discount_percent = parseOptionalNumber(item.discount_percent ?? item.discountPercent ?? item.discount);
      const cgst = parseOptionalNumber(item.cgst_percent ?? item.cgst);
      const sgst = parseOptionalNumber(item.sgst_percent ?? item.sgst);

      if (!component_id || !Number.isFinite(quantity) || quantity <= 0) return null;

      return {
        component_id,
        component_name,
        quantity,
        unit,
        specifications,
        estimated_unit_cost,
        discount_percent,
        cgst,
        sgst,
      };
    })
    .filter(Boolean);
};

const aggregateEnquiriesFromItems = (rows = []) => {
  const enquiryMap = new Map();

  for (const row of rows) {
    const enquiryId = row.enquiry_id;
    if (!enquiryId) continue;

    if (!enquiryMap.has(enquiryId)) {
      enquiryMap.set(enquiryId, {
        enquiry_id: enquiryId,
        vendor_id: row.vendor_id || null,
        purchase_manager_id: row.purchase_manager_id || null,
        title: row.title || null,
        description: row.description || null,
        notes: row.notes || null,
        requested_date: row.requested_date || row.created_at || null,
        required_delivery_date: row.required_delivery_date || null,
        source: row.source || null,
        planning_request_id: row.planning_request_id || null,
        status: row.status || 'pending',
        rejection_reason: row.rejection_reason || null,
        created_at: row.created_at || null,
        updated_at: row.updated_at || row.created_at || null,
        items: [],
      });
    }

    const enquiry = enquiryMap.get(enquiryId);

    enquiry.items.push({
      item_id: row.item_id,
      enquiry_id: row.enquiry_id,
      component_id: row.component_id,
      component_name: row.component_name || null,
      quantity: row.quantity,
      unit: row.unit || null,
      specifications: row.specifications || null,
      estimated_unit_cost: parseOptionalNumber(row.estimated_unit_cost),
      discount_percent: parseOptionalNumber(row.discount_percent),
      cgst: parseOptionalNumber(row.cgst),
      sgst: parseOptionalNumber(row.sgst),
      created_at: row.created_at || null,
    });

    const rowCreatedAt = row.created_at ? new Date(row.created_at).getTime() : null;
    const enquiryCreatedAt = enquiry.created_at ? new Date(enquiry.created_at).getTime() : null;
    if (rowCreatedAt && (!enquiryCreatedAt || rowCreatedAt < enquiryCreatedAt)) {
      enquiry.created_at = row.created_at;
    }

    const rowUpdatedAt = row.updated_at ? new Date(row.updated_at).getTime() : null;
    const enquiryUpdatedAt = enquiry.updated_at ? new Date(enquiry.updated_at).getTime() : null;
    if (rowUpdatedAt && (!enquiryUpdatedAt || rowUpdatedAt > enquiryUpdatedAt)) {
      enquiry.updated_at = row.updated_at;
    }
  }

  return Array.from(enquiryMap.values()).sort(
    (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
  );
};

const mergeParentEnquiries = (itemBasedEnquiries = [], parentRows = []) => {
  const mergedMap = new Map(itemBasedEnquiries.map((enquiry) => [enquiry.enquiry_id, enquiry]));

  for (const parent of parentRows || []) {
    const enquiryId = parent.enquiry_id;
    if (!enquiryId) continue;

    if (!mergedMap.has(enquiryId)) {
      mergedMap.set(enquiryId, {
        enquiry_id: enquiryId,
        vendor_id: parent.vendor_id || null,
        purchase_manager_id: parent.purchase_manager_id || null,
        title: parent.title || null,
        description: parent.description || null,
        notes: parent.notes || null,
        requested_date: parent.requested_date || parent.created_at || null,
        required_delivery_date: parent.required_delivery_date || null,
        source: parent.source || null,
        planning_request_id: parent.planning_request_id || null,
        status: parent.status || 'pending',
        rejection_reason: parent.rejection_reason || null,
        created_at: parent.created_at || null,
        updated_at: parent.updated_at || parent.created_at || null,
        items: [],
      });
      continue;
    }

    const existing = mergedMap.get(enquiryId);
    existing.vendor_id = existing.vendor_id || parent.vendor_id || null;
    existing.purchase_manager_id = existing.purchase_manager_id || parent.purchase_manager_id || null;
    existing.title = existing.title || parent.title || null;
    existing.description = existing.description || parent.description || null;
    existing.notes = existing.notes || parent.notes || null;
    existing.requested_date = existing.requested_date || parent.requested_date || parent.created_at || null;
    existing.required_delivery_date = existing.required_delivery_date || parent.required_delivery_date || null;
    existing.source = existing.source || parent.source || null;
    existing.planning_request_id = existing.planning_request_id || parent.planning_request_id || null;
    existing.status = parent.status ?? existing.status ?? 'pending';
    existing.rejection_reason = existing.rejection_reason || parent.rejection_reason || null;
    existing.created_at = existing.created_at || parent.created_at || null;
    existing.updated_at = existing.updated_at || parent.updated_at || existing.updated_at;
  }

  return Array.from(mergedMap.values()).sort(
    (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
  );
};

/**
 * Create Purchase Enquiry
 * PM can create emergency RFQ for components
 */
exports.createPurchaseEnquiry = async (req, res) => {
  try {
    console.log('ENQUIRY Controller - createPurchaseEnquiry called');
    console.log('Request URL:', req.originalUrl);
    console.log('Request body:', req.body);
    
    const { companyId, vendorId, title, description, notes, items, enquiryItems, requiredDeliveryDate, source, planningRequestId } = req.body;
    const purchaseManagerId = req.user?.vendor_id; // This will be from purchase manager auth
    const normalizedItems = normalizeEnquiryItems(items || enquiryItems);
    const firstItem = normalizedItems[0] || null;
    const enquiryTitle = (title || '').trim() || `Component Enquiry - ${firstItem?.component_id || 'Item'}`;
    const enquiryDescription = description !== undefined
      ? description
      : (firstItem?.specifications || null);

    // Validation
    const errors = [];
    if (!vendorId) {
      errors.push('Vendor is required');
    }
    if (!enquiryTitle || enquiryTitle.trim().length === 0) {
      errors.push('Title is required');
    }
    if (!requiredDeliveryDate) {
      errors.push('Required delivery date is required');
    }
    if (!source) {
      errors.push('Source is required');
    }
    if (!normalizedItems || normalizedItems.length === 0) {
      errors.push('At least one item must be selected');
    }
    
    if (errors.length > 0) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors,
        received: {
          vendorId: !!vendorId,
          title: !!enquiryTitle,
          requiredDeliveryDate: !!requiredDeliveryDate,
          source: !!source,
          itemsCount: normalizedItems.length
        }
      });
    }

    const enquiryId = `${buildEnquiryIdPrefix(vendorId)}${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const now = new Date().toISOString();

    // Ensure parent enquiry exists to satisfy FK purchase_enquiry_items_enquiry_fkey
    const parentEnquiry = {
      enquiry_id: enquiryId,
      vendor_id: vendorId,
      purchase_manager_id: purchaseManagerId,
      title: enquiryTitle,
      description: enquiryDescription || null,
      notes: notes || null,
      requested_date: now,
      required_delivery_date: requiredDeliveryDate || null,
      source: source || 'emergency',
      planning_request_id: planningRequestId || null,
      status: 'pending',
      created_at: now,
      updated_at: now,
    };

    const { error: parentInsertError } = await insertSingleWithColumnFallback('purchase_enquiry', parentEnquiry);

    if (parentInsertError && parentInsertError.code !== '23505') {
      throw parentInsertError;
    }

    // Add enquiry items
    const itemInserts = normalizedItems.map((item) => ({
      item_id: uuidv4(),
      enquiry_id: enquiryId,
      component_id: item.component_id,
      component_name: item.component_name || null,
      quantity: item.quantity,
      unit: item.unit || null,
      specifications: item.specifications || null,
      estimated_unit_cost: item.estimated_unit_cost,
      discount_percent: item.discount_percent,
      cgst: item.cgst,
      sgst: item.sgst,
      vendor_id: vendorId,
      purchase_manager_id: purchaseManagerId,
      title: enquiryTitle,
      description: enquiryDescription || null,
      notes: notes || null,
      requested_date: now,
      required_delivery_date: requiredDeliveryDate || null,
      source: source || 'emergency',
      planning_request_id: planningRequestId || null,
      status: 'pending',
      rejection_reason: null,
      created_at: now,
      updated_at: now,
    }));

    const { error: itemsError } = await insertWithColumnFallback('purchase_enquiry_items', itemInserts);

    if (itemsError) throw itemsError;

    // Fetch complete enquiry with items
    const { data: insertedRows, error: insertedRowsError } = await supabase
      .from('purchase_enquiry_items')
      .select('*')
      .eq('enquiry_id', enquiryId)
      .order('created_at', { ascending: true });

    if (insertedRowsError) throw insertedRowsError;

    const [completeEnquiry] = aggregateEnquiriesFromItems(insertedRows || []);

    res.status(201).json({
      message: 'Purchase enquiry created successfully',
      enquiry: completeEnquiry,
    });
  } catch (error) {
    console.error('Error creating purchase enquiry:', error);
    res.status(500).json({ error: error.message || 'Failed to create purchase enquiry' });
  }
};

/**
 * Get Purchase Enquiry by ID
 */
exports.getPurchaseEnquiry = async (req, res) => {
  try {
    const { enquiryId } = req.params;

    const { data: rows, error } = await supabase
      .from('purchase_enquiry_items')
      .select('*')
      .eq('enquiry_id', enquiryId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    const { data: parentRows, error: parentError } = await supabase
      .from('purchase_enquiry')
      .select('*')
      .eq('enquiry_id', enquiryId)
      .limit(1);

    if (parentError) throw parentError;

    const itemBased = aggregateEnquiriesFromItems(rows || []);
    const [enquiry] = mergeParentEnquiries(itemBased, parentRows || []);
    if (!enquiry) {
      return res.status(404).json({ error: 'Enquiry not found' });
    }

    res.json({ enquiry });
  } catch (error) {
    console.error('Error fetching purchase enquiry:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch enquiry' });
  }
};

/**
 * Get all Purchase Enquiries for a Company
 */
exports.getPurchaseEnquiries = async (req, res) => {
  try {
    const { status, vendorId } = req.query;

    const { data: rows, error } = await supabase
      .from('purchase_enquiry_items')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Supabase query error:', error);
      throw error;
    }

    let parentQuery = supabase
      .from('purchase_enquiry')
      .select('*')
      .order('created_at', { ascending: false });

    if (vendorId) {
      parentQuery = parentQuery.eq('vendor_id', vendorId);
    }

    if (status) {
      parentQuery = parentQuery.eq('status', status);
    }

    const { data: parentRows, error: parentError } = await parentQuery;

    if (parentError) {
      console.error('Supabase parent enquiry query error:', parentError);
      throw parentError;
    }

    let enquiries = mergeParentEnquiries(aggregateEnquiriesFromItems(rows || []), parentRows || []);

    if (vendorId) {
      const prefix = buildEnquiryIdPrefix(vendorId);
      enquiries = enquiries.filter((entry) => String(entry.vendor_id) === String(vendorId) || String(entry.enquiry_id || '').startsWith(prefix));
    }

    if (status) {
      enquiries = enquiries.filter((entry) => String(entry.status || 'pending') === String(status));
    }

    console.log('Found enquiries:', enquiries?.length || 0, 'for vendorId:', vendorId);

    res.json({
      enquiries: enquiries || [],
      total: enquiries?.length || 0,
    });
  } catch (error) {
    console.error('Error fetching purchase enquiries:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch enquiries' });
  }
};

/**
 * Update Purchase Enquiry Status
 */
exports.updatePurchaseEnquiry = async (req, res) => {
  try {
    const { enquiryId } = req.params;
    const { status, description, title, notes, requiredDeliveryDate, source, items } = req.body;
    const normalizedItems = normalizeEnquiryItems(items);

    const { data: parentRows, error: parentRowsError } = await supabase
      .from('purchase_enquiry')
      .select('*')
      .eq('enquiry_id', enquiryId)
      .limit(1);

    if (parentRowsError) throw parentRowsError;
    const parentMeta = (parentRows || [])[0] || null;

    const { data: existingRows, error: existingRowsError } = await supabase
      .from('purchase_enquiry_items')
      .select('*')
      .eq('enquiry_id', enquiryId)
      .order('created_at', { ascending: true });

    if (existingRowsError) throw existingRowsError;

    if ((!existingRows || existingRows.length === 0) && !parentMeta) {
      return res.status(404).json({ error: 'Enquiry not found' });
    }

    const currentMeta = existingRows?.[0] || parentMeta || {};

    const hasEditFields = (
      title !== undefined
      || description !== undefined
      || notes !== undefined
      || requiredDeliveryDate !== undefined
      || source !== undefined
      || Array.isArray(items)
    );

    if ((currentMeta?.status || parentMeta?.status) === 'accepted' && hasEditFields) {
      return res.status(400).json({ error: 'Accepted enquiry cannot be edited' });
    }

    const updateData = {
      updated_at: new Date().toISOString(),
    };

    if (status) updateData.status = status;
    if (title) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (notes !== undefined) updateData.notes = notes;
    if (requiredDeliveryDate !== undefined) updateData.required_delivery_date = requiredDeliveryDate;
    if (source !== undefined) updateData.source = source;

    // If updating a rejected enquiry, reset it to pending (and clear rejection reason)
    if (currentMeta?.status === 'rejected') {
      updateData.status = 'pending';
      updateData.rejection_reason = null;
    }

    const { error: parentUpdateError } = await updateWithColumnFallback('purchase_enquiry', 'enquiry_id', enquiryId, updateData);
    if (parentUpdateError) throw parentUpdateError;

    const { error } = await updateWithColumnFallback('purchase_enquiry_items', 'enquiry_id', enquiryId, updateData);
    if (error) throw error;

    if (Array.isArray(items)) {
      await supabase
        .from('purchase_enquiry_items')
        .delete()
        .eq('enquiry_id', enquiryId);

      if (normalizedItems.length > 0) {
        const now = new Date().toISOString();
        const itemInserts = normalizedItems.map((item) => ({
          item_id: uuidv4(),
          enquiry_id: enquiryId,
          component_id: item.component_id,
          component_name: item.component_name || null,
          quantity: item.quantity,
          unit: item.unit || null,
          specifications: item.specifications || null,
          estimated_unit_cost: item.estimated_unit_cost,
          discount_percent: item.discount_percent,
          cgst: item.cgst,
          sgst: item.sgst,
          vendor_id: currentMeta.vendor_id,
          purchase_manager_id: currentMeta.purchase_manager_id,
          title: title ?? currentMeta.title,
          description: description !== undefined ? description : currentMeta.description,
          notes: notes !== undefined ? notes : currentMeta.notes,
          requested_date: currentMeta.requested_date || currentMeta.created_at,
          required_delivery_date: requiredDeliveryDate !== undefined ? requiredDeliveryDate : currentMeta.required_delivery_date,
          source: source !== undefined ? source : currentMeta.source,
          planning_request_id: currentMeta.planning_request_id || null,
          status: updateData.status || currentMeta.status || 'pending',
          rejection_reason: updateData.rejection_reason !== undefined ? updateData.rejection_reason : currentMeta.rejection_reason,
          created_at: now,
          updated_at: now,
        }));

        const { error: itemsError } = await insertWithColumnFallback('purchase_enquiry_items', itemInserts);

        if (itemsError) throw itemsError;
      }
    }

    const { data: updatedRows, error: updatedRowsError } = await supabase
      .from('purchase_enquiry_items')
      .select('*')
      .eq('enquiry_id', enquiryId)
      .order('created_at', { ascending: true });

    if (updatedRowsError) throw updatedRowsError;

    const itemBased = aggregateEnquiriesFromItems(updatedRows || []);
    const [enquiry] = mergeParentEnquiries(itemBased, [parentMeta].filter(Boolean));

    res.json({
      message: 'Enquiry updated successfully',
      enquiry,
    });
  } catch (error) {
    console.error('Error updating purchase enquiry:', error);
    res.status(500).json({ error: error.message || 'Failed to update enquiry' });
  }
};

/**
 * Reject Purchase Enquiry (Vendor rejects or PM rejects)
 */
exports.rejectPurchaseEnquiry = async (req, res) => {
  try {
    const { enquiryId } = req.params;
    const { rejectionReason } = req.body;

    if (!rejectionReason) {
      return res.status(400).json({
        error: 'Rejection reason is required'
      });
    }

    const rejectionUpdate = {
      status: 'rejected',
      rejection_reason: rejectionReason,
      updated_at: new Date().toISOString(),
    };

    const { error: parentUpdateError } = await updateWithColumnFallback('purchase_enquiry', 'enquiry_id', enquiryId, rejectionUpdate);
    if (parentUpdateError) throw parentUpdateError;

    const { error } = await updateWithColumnFallback('purchase_enquiry_items', 'enquiry_id', enquiryId, rejectionUpdate);

    if (error) throw error;

    const { data: updatedRows, error: updatedRowsError } = await supabase
      .from('purchase_enquiry_items')
      .select('*')
      .eq('enquiry_id', enquiryId)
      .order('created_at', { ascending: true });

    if (updatedRowsError) throw updatedRowsError;

    const [enquiry] = aggregateEnquiriesFromItems(updatedRows || []);

    res.json({
      message: 'Enquiry rejected successfully',
      enquiry,
    });
  } catch (error) {
    console.error('Error rejecting purchase enquiry:', error);
    res.status(500).json({ error: error.message || 'Failed to reject enquiry' });
  }
};

/**
 * Delete Purchase Enquiry
 */
exports.deletePurchaseEnquiry = async (req, res) => {
  try {
    const { enquiryId } = req.params;

    // Delete enquiry items
    await supabase
      .from('purchase_enquiry_items')
      .delete()
      .eq('enquiry_id', enquiryId);

    // Best-effort cleanup for parent enquiry row
    await supabase
      .from('purchase_enquiry')
      .delete()
      .eq('enquiry_id', enquiryId);

    res.json({ message: 'Enquiry deleted successfully' });
  } catch (error) {
    console.error('Error deleting purchase enquiry:', error);
    res.status(500).json({ error: error.message || 'Failed to delete enquiry' });
  }
};
