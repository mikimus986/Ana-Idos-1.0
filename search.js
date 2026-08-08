// search.js

window.searchTimetable = (() => {

    const cache = new Map();

    // =========================================
    // NAČTENÍ JÍZDNÍHO ŘÁDU
    // =========================================

    async function loadTimetable(line) {

        line = String(line);

        if (cache.has(line)) {
            return cache.get(line);
        }

        const response = await fetch(
            `data/timetables/${line}.json`
        );

        if (!response
