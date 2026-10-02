function createDeviceService({ getRecordRepository, getAuditRepository, getCounterRepository }) {
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

  function counters() {
    return getCounterRepository && getCounterRepository();
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
    async getDashboardKpiTrends(referenceDate = new Date()) {
      const dayStart = (date) => {
        const next = new Date(date);
        next.setHours(0, 0, 0, 0);
        return next;
      };

      const countInWindow = async (filter, start, end) => {
        const windowFilter = {
          ...filter,
          createdAt: { $gte: start, $lt: end },
        };
        if (typeof records().countDocuments === "function") {
          return records().countDocuments(windowFilter);
        }
        return (await records().find(windowFilter)).length;
      };

      const buildSparkline = async (filter, endDate) => {
        const values = [];
        const chartEnd = dayStart(endDate);
        for (let dayOffset = 9; dayOffset >= 0; dayOffset -= 1) {
          const start = new Date(chartEnd);
          start.setDate(start.getDate() - dayOffset);
          const end = new Date(start);
          end.setDate(end.getDate() + 1);
          values.push(await countInWindow(filter, start, end));
        }
        const maxValue = Math.max(...values, 1);
        return values
          .map((value) => Math.round((value / maxValue) * 100))
          .join(",");
      };

      const metrics = [
        { key: "total", filter: { deletedAt: null } },
        { key: "atOffice", filter: { deletedAt: null, status: "At_office" } },
        { key: "returned", filter: { deletedAt: null, status: "Returned" } },
      ];

      const trends = {};
      for (const metric of metrics) {
        const currentWindowEnd = dayStart(referenceDate);
        currentWindowEnd.setDate(currentWindowEnd.getDate() + 1);
        const currentWindowStart = new Date(currentWindowEnd);
        currentWindowStart.setDate(currentWindowStart.getDate() - 29);

        const previousWindowEnd = new Date(currentWindowStart);
        const previousWindowStart = new Date(previousWindowEnd);
        previousWindowStart.setDate(previousWindowStart.getDate() - 30);

        const [currentValue, previousValue] = await Promise.all([
          countInWindow(metric.filter, currentWindowStart, currentWindowEnd),
          countInWindow(metric.filter, previousWindowStart, previousWindowEnd),
        ]);

        const delta =
          previousValue === 0
            ? currentValue > 0
              ? 100
              : 0
            : Math.round(
                ((currentValue - previousValue) / previousValue) * 100,
              );

        trends[metric.key] = {
          current: currentValue,
          previous: previousValue,
          delta,
          sparkline: await buildSparkline(metric.filter, referenceDate),
        };
      }

      return trends;
    },
    async getDashboardHeatmap(referenceDate = new Date()) {
      const end = new Date(referenceDate);
      end.setHours(23, 59, 59, 999);
      const start = new Date(referenceDate);
      start.setMonth(start.getMonth() - 11);
      start.setDate(1);
      start.setHours(0, 0, 0, 0);

      const days = [];
      const countsByDate = new Map();
      const recordDocs = await records().find({
        deletedAt: null,
        createdAt: { $gte: start, $lte: end },
      });

      for (const doc of recordDocs) {
        const dateKey = new Date(doc.createdAt).toISOString().slice(0, 10);
        countsByDate.set(dateKey, (countsByDate.get(dateKey) || 0) + 1);
      }

      for (
        let cursor = new Date(start);
        cursor <= end;
        cursor.setDate(cursor.getDate() + 1)
      ) {
        const iso = cursor.toISOString().slice(0, 10);
        days.push({
          date: iso,
          count: countsByDate.get(iso) || 0,
        });
      }

      return days;
    },
    async getRepeatOffenders(limit = 10) {
      const rows = await records().find({ deletedAt: null });
      const counts = new Map();

      for (const row of rows) {
        const name = String(row && row.sname ? row.sname : "").trim();
        if (!name) continue;
        counts.set(name, (counts.get(name) || 0) + 1);
      }

      return [...counts.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort(
          (left, right) =>
            right.count - left.count || left.name.localeCompare(right.name),
        )
        .slice(0, limit);
    },
    async getEmployeeLeaderboard(limit = 5, referenceDate = new Date()) {
      const rows = await records().find({ deletedAt: null });
      const now = new Date(referenceDate);
      const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
      const nextMonthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
      const counts = new Map();

      for (const row of rows) {
        const name = String(row && row.ename ? row.ename : "").trim();
        const employeeId = String(row && row.eid ? row.eid : "").trim();
        if (!name && !employeeId) continue;

        const key = employeeId
          ? `id:${employeeId.toLocaleLowerCase()}`
          : `name:${name.toLocaleLowerCase()}`;
        let employee = counts.get(key);
        if (!employee) {
          employee = {
            name: name || employeeId,
            employeeId,
            totalIntakes: 0,
            monthIntakes: 0,
          };
          counts.set(key, employee);
        }
        if (!employee.employeeId && employeeId) employee.employeeId = employeeId;
        employee.totalIntakes += 1;

        const timestamp = row.createdAt
          ? new Date(row.createdAt).getTime()
          : null;
        if (
          Number.isFinite(timestamp) &&
          timestamp >= monthStart &&
          timestamp < nextMonthStart
        ) {
          employee.monthIntakes += 1;
        }
      }

      const requestedLimit = Number.isInteger(Number(limit)) ? Number(limit) : 5;
      const safeLimit = Math.max(1, Math.min(20, requestedLimit));
      return [...counts.values()]
        .sort(
          (left, right) =>
            right.totalIntakes - left.totalIntakes ||
            right.monthIntakes - left.monthIntakes ||
            left.name.localeCompare(right.name),
        )
        .slice(0, safeLimit);
    },
    async getDashboardAgingKpis(referenceDate = new Date()) {
      const now = new Date(referenceDate);
      const [over7Days, over30Days, over90Days] = await Promise.all([
        records().countDocuments({
          deletedAt: null,
          status: "At_office",
          createdAt: { $lt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
        }),
        records().countDocuments({
          deletedAt: null,
          status: "At_office",
          createdAt: {
            $lt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
          },
        }),
        records().countDocuments({
          deletedAt: null,
          status: "At_office",
          createdAt: {
            $lt: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000),
          },
        }),
      ]);

      return { over7Days, over30Days, over90Days };
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
    async findDuplicate(record) {
      const normalized = record || {};
      const uniqueFields = ["rno", "clg", "brch", "year", "sec"];
      const classRoll = uniqueFields.every((field) => {
        const value = normalized[field];
        return typeof value === "string" && value.trim().length > 0;
      });
      const imei = typeof normalized.imei === "string" ? normalized.imei.trim() : "";
      const queries = [];

      if (classRoll) {
        queries.push({
          rno: normalized.rno.trim(),
          clg: normalized.clg.trim(),
          brch: normalized.brch.trim(),
          year: normalized.year.trim(),
          sec: normalized.sec.trim(),
          deletedAt: null,
        });
      }
      if (imei) {
        queries.push({ imei, deletedAt: null });
      }

      if (!queries.length) return { type: null, matches: [] };

      const matches = await Promise.all(
        queries.map((query) => records().find(query)),
      );
      const merged = matches
        .flat()
        .filter((entry) => entry && entry._id)
        .reduce((acc, entry) => {
          acc.set(String(entry._id), entry);
          return acc;
        }, new Map());

      const duplicates = [...merged.values()];
      if (!duplicates.length) return { type: null, matches: [] };

      const classRollMatch = classRoll
        ? duplicates.some(
            (entry) =>
              entry.rno === normalized.rno.trim() &&
              entry.clg === normalized.clg.trim() &&
              entry.brch === normalized.brch.trim() &&
              entry.year === normalized.year.trim() &&
              entry.sec === normalized.sec.trim(),
          )
        : false;
      const imeiMatch = imei
        ? duplicates.some((entry) => entry.imei === imei)
        : false;

      return {
        type: classRollMatch && imeiMatch ? "both" : classRollMatch ? "class-roll" : imeiMatch ? "imei" : null,
        matches: duplicates,
      };
    },
    async generateReceiptNumber() {
      const counterRepository = counters();
      if (!counterRepository || typeof counterRepository.findOneAndUpdate !== "function") {
        return null;
      }
      const year = new Date().getFullYear();
      const key = `receipt-${year}`;
      const counter = await counterRepository.findOneAndUpdate(
        { _id: key },
        { $inc: { seq: 1 } },
        { upsert: true, new: true },
      );
      const serial = Number(counter && counter.seq ? counter.seq : 1);
      return `MSA-${year}-${String(serial).padStart(6, "0")}`;
    },
    async create(record, changedByEmail) {
      const duplicate = await this.findDuplicate(record);
      if (duplicate.type) {
        const error = new Error("Duplicate record detected.");
        error.statusCode = 409;
        error.duplicateType = duplicate.type;
        throw error;
      }

      const receiptNo = await this.generateReceiptNumber();
      const createdRecord = await records().insert({
        ...record,
        ...(receiptNo ? { receiptNo } : {}),
      });
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
    async markReturned(recordId, changedByEmail, returnData = {}) {
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
      const normalizedReturnData = {
        returnedBy:
          typeof returnData.returnedBy === "string"
            ? returnData.returnedBy.trim()
            : previous.returnedBy || null,
        returnRelation:
          typeof returnData.returnRelation === "string"
            ? returnData.returnRelation.trim()
            : previous.returnRelation || null,
        returnedAt: returnData.returnedAt
          ? new Date(returnData.returnedAt)
          : previous.returnedAt || null,
        returnSignature:
          typeof returnData.returnSignature === "string"
            ? returnData.returnSignature.trim()
            : previous.returnSignature || null,
        returnNotes:
          typeof returnData.returnNotes === "string"
            ? returnData.returnNotes.trim()
            : previous.returnNotes || null,
      };
      const result = await records().update(
        { _id: recordId, deletedAt: null },
        {
          $set: {
            status: "Returned",
            statusChangedBy,
            statusChangedAt,
            ...normalizedReturnData,
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
          {
            field: "returnedBy",
            oldValue: previous.returnedBy,
            newValue: normalizedReturnData.returnedBy,
          },
          {
            field: "returnSignature",
            oldValue: previous.returnSignature,
            newValue: normalizedReturnData.returnSignature,
          },
        ]);
      }
      return result;
    },
    findById(recordId) {
      return records().find({ _id: recordId, deletedAt: null });
    },
    async updateById(recordId, record, changedByEmail, expectedVersion = null) {
      const previous = (
        await records().find({ _id: recordId, deletedAt: null })
      )[0];
      if (!previous) return { ok: 0, matchedCount: 0, modifiedCount: 0 };
      if (
        expectedVersion != null &&
        previous.__v !== undefined &&
        Number(previous.__v) !== Number(expectedVersion)
      ) {
        const error = new Error(
          "Record was changed by another staff member. Reload and try again.",
        );
        error.statusCode = 409;
        throw error;
      }
      const result = await records().update(
        {
          _id: recordId,
          deletedAt: null,
          ...(expectedVersion != null ? { __v: Number(expectedVersion) } : {}),
        },
        { $set: record, $inc: { __v: 1 } },
      );
      if (result.matchedCount === 0 && expectedVersion != null) {
        const error = new Error(
          "Record was changed by another staff member. Reload and try again.",
        );
        error.statusCode = 409;
        throw error;
      }
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
    async getDashboardActivity(limit = 20, referenceDate = new Date()) {
      const repository = auditLogs();
      if (!repository) return [];

      const end = new Date(referenceDate);
      end.setHours(24, 0, 0, 0);
      const start = new Date(end);
      start.setDate(start.getDate() - 1);
      const entries = await repository.find({
        changedAt: { $gte: start, $lt: end },
      });
      const grouped = new Map();

      for (const entry of entries) {
        const changedAt = new Date(entry.changedAt);
        const timestamp = changedAt.getTime();
        if (!Number.isFinite(timestamp) || timestamp < start || timestamp >= end)
          continue;

        const actionType = entry.actionType || "UPDATE";
        const actor = String(entry.changedByEmail || "");
        const recordId = String(entry.recordId || "");
        const groupKey = [
          recordId,
          actionType,
          actor.toLocaleLowerCase(),
          Math.floor(timestamp / 1000),
        ].join("|");
        let activity = grouped.get(groupKey);
        if (!activity) {
          activity = {
            recordId,
            recordRno: entry.recordRno || "",
            actionType,
            changedByEmail: actor,
            changedAt,
            count: 0,
            summary: "Updated record",
          };
          grouped.set(groupKey, activity);
        }
        activity.count += 1;
        if (timestamp > activity.changedAt.getTime()) activity.changedAt = changedAt;
        if (actionType === "CREATE") activity.summary = "Created record";
        if (actionType === "DELETE") activity.summary = "Deleted record";
        if (actionType === "RESTORE") activity.summary = "Restored record";
        if (actionType === "STATUS_CHANGE") {
          activity.summary = entry.newValue === "Returned"
            ? "Marked returned"
            : "Changed status";
        }
      }

      const requestedLimit = Number.isInteger(Number(limit)) ? Number(limit) : 20;
      const safeLimit = Math.max(1, Math.min(100, requestedLimit));
      return [...grouped.values()]
        .sort((left, right) => right.changedAt - left.changedAt)
        .slice(0, safeLimit);
    },
  };
}

module.exports = { createDeviceService };
