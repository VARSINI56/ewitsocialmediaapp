// utils/importCSV.js
const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");

let students = [];

/**
 * Loads student data from students.csv into memory.
 * Automatically trims spaces, handles missing files,
 * and logs the number of records loaded.
 */
const loadStudents = () => {
  return new Promise((resolve, reject) => {
    const filePath = path.join(__dirname, "..", "students.csv");

    // Check if CSV file exists
    if (!fs.existsSync(filePath)) {
      console.warn("⚠️  students.csv file not found — skipping CSV load.");
      return resolve();
    }

    const results = [];

    fs.createReadStream(filePath)
      .pipe(csv({ mapHeaders: ({ header }) => header.trim() }))
      .on("data", (row) => {
        // Normalize all keys to lowercase (optional)
        const cleaned = {};
        for (const key in row) {
          cleaned[key.toLowerCase().trim()] = row[key].trim();
        }
        results.push(cleaned);
      })
      .on("end", () => {
        students = results;
        console.log(`✅ Loaded ${students.length} students from CSV`);
        resolve();
      })
      .on("error", (err) => {
        console.error("❌ Error reading students.csv:", err);
        reject(err);
      });
  });
};

/**
 * Returns the loaded student records.
 */
const getStudents = () => students;

module.exports = { loadStudents, getStudents };
