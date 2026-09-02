const natural = require("natural");

const stemmer = natural.PorterStemmer;

function normalizeName(name) {
    if (!name || typeof name !== "string") {
        return "";
    }

    return name
        // Normalise line endings
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")

        // Lowercase
        .toLowerCase()

        // Remove punctuation
        .replace(/[^\w\s]/g, " ")

        // Trim whitespace
        .trim()

        // Collapse multiple spaces
        .replace(/\s+/g, " ")

        // Stem every word
        .split(" ")
        .map(word => stemmer.stem(word))
        .join(" ");
}

module.exports = normalizeName;



