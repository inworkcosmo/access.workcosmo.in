import { createRecord, deleteRecord, listCollection, listByCompany, updateRecord } from "./firestoreService.js";

const COLLECTION_NAME = "billingRecords";

export async function createBillingRecord(payload) {
    return createRecord(COLLECTION_NAME, payload);
}

export async function listBillingRecords(companyId = null) {
    if (companyId) {
        return listByCompany(COLLECTION_NAME, companyId, "invoiceDate");
    }
    return listCollection(COLLECTION_NAME, "invoiceDate", "desc");
}

export async function updateBillingRecord(id, payload) {
    return updateRecord(COLLECTION_NAME, id, payload);
}

export async function deleteBillingRecord(id) {
    return deleteRecord(COLLECTION_NAME, id);
}
