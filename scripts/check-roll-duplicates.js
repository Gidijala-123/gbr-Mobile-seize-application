require("dotenv").config();
const { MongoClient } = require("mongodb");
const { sanitizeMongoUri } = require("../utils/db");

async function main() {
  const uri = sanitizeMongoUri(process.env.MONGODB_URI);
  if (!uri) throw new Error("MONGODB_URI must be configured.");

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  try {
    await client.connect();
    const database = client.db();
    const records = database.collection("student_data");
    const groups = await records
      .aggregate([
        {
          $match: {
            rno: { $type: "string" },
            clg: { $type: "string" },
            brch: { $type: "string" },
            year: { $type: "string" },
            sec: { $type: "string" },
          },
        },
        {
          $group: {
            _id: {
              rno: "$rno",
              clg: "$clg",
              brch: "$brch",
              year: "$year",
              sec: "$sec",
            },
            count: { $sum: 1 },
          },
        },
        { $match: { count: { $gt: 1 } } },
        { $count: "duplicateGroups" },
      ])
      .toArray();
    const duplicateGroups = groups[0] ? groups[0].duplicateGroups : 0;
    console.log(`Duplicate class-roll groups: ${duplicateGroups}`);
    if (duplicateGroups > 0) {
      process.exitCode = 1;
      return;
    }

    if (process.argv.includes("--ensure-index")) {
      const name = await records.createIndex(
        { rno: 1, clg: 1, brch: 1, year: 1, sec: 1 },
        { unique: true, name: "student_class_roll_unique" },
      );
      const indexes = await records.listIndexes().toArray();
      const index = indexes.find((entry) => entry.name === name);
      if (!index || index.unique !== true)
        throw new Error("The unique class-roll index was not created.");
      console.log("Unique class-roll index ensured.");
    }
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error("Duplicate class-roll check failed:", error.message);
  process.exitCode = 1;
});
