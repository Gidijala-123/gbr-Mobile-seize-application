function createDeviceService({ getRecordRepository, getAuditRepository }) {
  const searchableFields = [
    "Date",
    "Time",
    "rno",
    "sname",
    "clg",
    "brch",
    "year",
    "sec",
    "spno",
    "pname",
    "ppno",
    "mmodel",
    "imei",
    "mclr",
    "rsn",
    "ename",
    "epno",
    "eid",
    "status",
  ];
  const sortableFields = new Set(searchableFields.concat(["_id"]));

  function records() {
    return getRecordRepository();
  }

  function auditLogs() {
    return getAuditRepository && getAuditRepository();
  }

  async function writeAuditEntries(
    record,
    actionType,
    changedByEmail,
    changes,
  ) {
    const repository = auditLogs();
    if (!repository || !changes.length) return;
    await Promise.all(
      changes.map(({ field, oldValue, newValue }) =>
        repository.insert({
          recordId: record._id,
          recordRno: record.rno || null,
          field,
          oldValue: oldValue == null ? null : oldValue,
          newValue: newValue == null ? null : newValue,
          changedByEmail,
          changedAt: new Date(),
          actionType,
        }),
      ),
    );
  }

  function valuesDiffer(left, right) {
    return (
      JSON.stringify(left == null ? null : left) !==
      JSON.stringify(right == null ? null : right)
    );
  }

  return {
    listAll() {
      return records().find({ deletedAt: null });
    },
    async getDashboardCounts() {
      const activeFilter = { deletedAt: null };
      const activeCountIndexHint = { deletedAt: 1, status: 1 };
      const [total, atOffice, returned] = await Promise.all([
        records().countDocuments(activeFilter, activeCountIndexHint),
        records().countDocuments(
          { ...activeFilter, status: "At_office" },
          activeCountIndexHint,
        ),
        records().countDocuments(
          { ...activeFilter, status: "Returned" },
          activeCountIndexHint,
        ),
      ]);
      return { total, atOffice, returned };
    },
    async listDataTablePage({
      draw,
      start,
      length,
      search,
      status,
      sortField,
      sortDirection,
    }) {
      const baseFilter = { deletedAt: null, ...(status ? { status } : {}) };
      const filter = { ...baseFilter };
      const searchTerm = typeof search === "string" ? search.trim() : "";
      if (searchTerm) {
        const escapedSearch = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        filter.$or = searchableFields.map((field) => ({
          [field]: { $regex: escapedSearch, $options: "i" },
        }));
      }

      const pageOffset = Math.max(0, start);
      const pageLength = Math.min(100, Math.max(1, length));
      const field = sortableFields.has(sortField) ? sortField : "_id";
      const direction = sortDirection === "desc" ? -1 : 1;
      const [recordsTotal, recordsFiltered, data] = await Promise.all([
        records().countDocuments(baseFilter),
        records().countDocuments(filter),
        records().findPage(
          filter,
          { [field]: direction },
          pageOffset,
          pageLength,
        ),
      ]);

      return { draw, recordsTotal, recordsFiltered, data };
    },
    async create(record, changedByEmail) {
      const createdRecord = await records().insert(record);
      await writeAuditEntries(
        createdRecord,
        "CREATE",
        changedByEmail,
        Object.entries(record).map(([field, newValue]) => ({
          field,
          oldValue: null,
          newValue,
        })),
      );
      return createdRecord;
    },
    async markReturned(recordId, changedByEmail) {
      const previous = (
        await records().find({ _id: recordId, deletedAt: null })
      )[0];
      if (!previous) return { ok: 0, matchedCount: 0, modifiedCount: 0 };
      const statusChanged = previous.status !== "Returned";
      const statusChangedAt = statusChanged
        ? new Date()
        : previous.statusChangedAt || new Date();
      const statusChangedBy = statusChanged
        ? changedByEmail
        : previous.statusChangedBy || changedByEmail;
      const result = await records().update(
        { _id: recordId, deletedAt: null },
        {
          $set: {
            status: "Returned",
            statusChangedBy,
            statusChangedAt,
          },
        },
      );
      if (result.matchedCount && statusChanged) {
        await writeAuditEntries(previous, "STATUS_CHANGE", changedByEmail, [
          { field: "status", oldValue: previous.status, newValue: "Returned" },
          {
            field: "statusChangedBy",
            oldValue: previous.statusChangedBy,
            newValue: statusChangedBy,
          },
          {
            field: "statusChangedAt",
            oldValue: previous.statusChangedAt,
            newValue: statusChangedAt,
          },
        ]);
      }
      return result;
    },
    findById(recordId) {
      return records().find({ _id: recordId, deletedAt: null });
    },
    async updateById(recordId, record, changedByEmail) {
      const previous = (
        await records().find({ _id: recordId, deletedAt: null })
      )[0];
      if (!previous) return { ok: 0, matchedCount: 0, modifiedCount: 0 };
      const result = await records().update(
        { _id: recordId, deletedAt: null },
        { $set: record },
      );
      if (result.matchedCount) {
        const changes = Object.entries(record)
          .filter(([field, newValue]) =>
            valuesDiffer(previous[field], newValue),
          )
          .map(([field, newValue]) => ({
            field,
            oldValue: previous[field],
            newValue,
          }));
        const actionType = changes.some((change) => change.field === "status")
          ? "STATUS_CHANGE"
          : "UPDATE";
        await writeAuditEntries(previous, actionType, changedByEmail, changes);
      }
      return result;
    },
    async deleteById(recordId, deletedBy) {
      const previous = (
        await records().find({ _id: recordId, deletedAt: null })
      )[0];
      if (!previous) return { ok: 0, matchedCount: 0, modifiedCount: 0 };
      const deletedAt = new Date();
      const result = await records().update(
        { _id: recordId, deletedAt: null },
        { $set: { deletedAt, deletedBy } },
      );
      if (result.matchedCount) {
        await writeAuditEntries(previous, "DELETE", deletedBy, [
          {
            field: "deletedAt",
            oldValue: previous.deletedAt,
            newValue: deletedAt,
          },
        ]);
      }
      return result;
    },
    listDeleted(cutoff) {
      return records()
        .find({ deletedAt: { $gte: cutoff } })
        .then((deletedRecords) =>
          deletedRecords.sort(
            (left, right) =>
              new Date(right.deletedAt).getTime() -
              new Date(left.deletedAt).getTime(),
          ),
        );
    },
    async restoreById(recordId, cutoff, changedByEmail) {
      const previous = (
        await records().find({ _id: recordId, deletedAt: { $gte: cutoff } })
      )[0];
      if (!previous) return { ok: 0, matchedCount: 0, modifiedCount: 0 };
      const result = await records().update(
        { _id: recordId, deletedAt: { $gte: cutoff } },
        { $set: { deletedAt: null, deletedBy: null } },
      );
      if (result.matchedCount) {
        await writeAuditEntries(previous, "RESTORE", changedByEmail, [
          { field: "deletedAt", oldValue: previous.deletedAt, newValue: null },
        ]);
      }
      return result;
    },
    purgeDeletedBefore(cutoff) {
      return records().remove({ deletedAt: { $lt: cutoff } });
    },
    async listRecentAuditLogs(limit = 500, recordId) {
      const repository = auditLogs();
      if (!repository) return [];
      const entries = await repository.find(recordId ? { recordId } : {});
      return entries
        .sort(
          (left, right) => new Date(right.changedAt) - new Date(left.changedAt),
        )
        .slice(0, limit);
    },
  };
}

module.exports = { createDeviceService };
