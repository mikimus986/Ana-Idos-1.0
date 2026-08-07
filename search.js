// ===============================
// ANA IDOS - search.js
// ===============================

let allStops = [];
let allLines = [];

// Sem přidávej nové linky
const timetableFiles = [
    "data/timetables/1.json",
    "data/timetables/2.json",
    "data/timetables/25.json",
    "data/timetables/26.json",
    "data/timetables/27.json",
    "data/timetables/77.json",
    "data/timetables/112.json",
    "data/timetables/113.json",
    "data/timetables/S1.json",
    "data/timetables/S2.json"
];

// ===============================
// Načtení zastávek
// ===============================

async function loadStops() {

    const response = await fetch("data/stops.json");
    allStops = await response.json();

    const list = document.getElementById("stops");
    list.innerHTML = "";

    allStops.forEach(stop => {

        const option = document.createElement("option");

        if (typeof stop === "string") {
            option.value = stop;
        } else {
            option.value = stop.name;
        }

        list.appendChild(option);

    });

}

// ===============================
// Načtení všech linek
// ===============================

async function loadTimetables() {

    allLines = [];

    for (const file of timetableFiles) {

        try {

            const response = await fetch(file);

            if (!response.ok)
                continue;

            const json = await response.json();

            allLines.push(json);

        }

        catch {

            console.log(file + " nenalezen.");

        }

    }

    console.log("Načteno linek:", allLines.length);

}

// ===============================
// Převod času
// ===============================

function timeToMinutes(time) {

    const parts = time.split(":");

    return Number(parts[0]) * 60 + Number(parts[1]);

}

// ===============================
// Vyhledávání přímých spojů
// ===============================

function findConnections(from, to, afterTime) {

    const results = [];

    const after = timeToMinutes(afterTime);

    allLines.forEach(line => {

        line.directions.forEach(direction => {

            const fromIndex = direction.stops.indexOf(from);
            const toIndex = direction.stops.indexOf(to);

            if (fromIndex === -1)
                return;

            if (toIndex === -1)
                return;

            if (fromIndex >= toIndex)
                return;

            direction.trips.forEach(trip => {

                const departure = trip[fromIndex];
                const arrival = trip[toIndex];

                if (!departure || !arrival)
                    return;

                if (timeToMinutes(departure) < after)
                    return;

                results.push({

                    line: line.line,

                    type: line.type,

                    direction: direction.name,

                    departure: departure,

                    arrival: arrival

                });

            });

        });

    });

    results.sort(function(a, b){

        return timeToMinutes(a.departure) - timeToMinutes(b.departure);

    });

    return results;

}

// ===============================
// Ikony dopravy
// ===============================

function getVehicleIcon(type){

    switch(type){

        case 1:
            return "🚌";

        case 2:
            return "🚎";

        case 3:
            return "🚋";

        case 4:
            return "🚆";

        default:
            return "❓";

    }

}

// ===============================
// Barvy linek
// ===============================

function getVehicleColor(type){

    switch(type){

        case 1:
            return "#2196F3";

        case 2:
            return "#4CAF50";

        case 3:
            return "#E53935";

        case 4:
            return "#FF9800";

        default:
            return "#777777";

    }

}

// ===============================
// Načtení po otevření stránky
// ===============================

window.addEventListener("load", async () => {

    await loadStops();

    await loadTimetables();

    console.log("Ana IDOS připraven.");

});
