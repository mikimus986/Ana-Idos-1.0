// ===============================
// ANA IDOS - search.js
// ===============================

let allStops = [];
let allRoutes = [];
let allLines = [];

// ===============================
// Načtení routes.json
// ===============================

async function loadRoutes() {

    const response = await fetch("data/routes.json");

    if (!response.ok) {
        console.error("Nepodařilo se načíst routes.json");
        return;
    }

    allRoutes = await response.json();

}

// ===============================
// Načtení stops.json
// ===============================

async function loadStops() {

    const response = await fetch("data/stops.json");

    if (!response.ok) {
        console.error("Nepodařilo se načíst stops.json");
        return;
    }

    allStops = await response.json();

    const datalist = document.getElementById("stops");

    datalist.innerHTML = "";

    allStops.forEach(stop => {

        const option = document.createElement("option");

        if (typeof stop === "string") {

            option.value = stop;

        } else {

            option.value = stop.name;

        }

        datalist.appendChild(option);

    });

}

// ===============================
// Načtení všech linek
// ===============================

async function loadTimetables() {

    allLines = [];

    for (const route of allRoutes) {

        try {

            const response = await fetch(
                "data/timetables/" + route.file
            );

            if (!response.ok)
                continue;

            const timetable = await response.json();

            timetable.type = route.type;
            timetable.line = route.line;

            allLines.push(timetable);

        }

        catch(error){

            console.log("Nepodařilo se načíst", route.file);

        }

    }

    console.log("Načteno linek:", allLines.length);

}

// ===============================
// Převod času
// ===============================

function timeToMinutes(time){

    if(!time)
        return -1;

    const parts = time.split(":");

    return Number(parts[0])*60 + Number(parts[1]);

}

// ===============================
// Ikony
// ===============================

function getVehicleIcon(type){

    switch(type){

        case 1: return "🚌";
        case 2: return "🚎";
        case 3: return "🚋";
        case 4: return "🚆";

        default: return "❓";

    }

}

// ===============================
// Barvy linek
// ===============================

function getVehicleColor(type){

    switch(type){

        case 1: return "#2196F3";
        case 2: return "#4CAF50";
        case 3: return "#E53935";
        case 4: return "#FF9800";

        default: return "#777";

    }

}
// ===============================
// Vyhledávání spojů
// ===============================

function findConnections(from, to, afterTime) {

    const results = [];

    const after = timeToMinutes(afterTime);

    allLines.forEach(line => {

        if (!line.directions) return;

        line.directions.forEach(direction => {

            const fromIndex = direction.stops.indexOf(from);
            const toIndex = direction.stops.indexOf(to);

            if (fromIndex === -1) return;
            if (toIndex === -1) return;
            if (fromIndex >= toIndex) return;

            direction.trips.forEach(trip => {

                const departure = trip[fromIndex];
                const arrival = trip[toIndex];

                if (!departure || !arrival) return;

                if (timeToMinutes(departure) < after) return;

                results.push({

                    line: line.line,
                    type: line.type,
                    direction: direction.name,

                    from: from,
                    to: to,

                    departure: departure,
                    arrival: arrival,

                    departureMinutes: timeToMinutes(departure)

                });

            });

        });

    });

    results.sort((a, b) => {

        return a.departureMinutes - b.departureMinutes;

    });

    return results;

}
function findTransferConnections(from, to, afterTime) {

    const direct = findConnections(from, to, afterTime);

    let results = [...direct];

    allStops.forEach(stop => {

        const stopName =
            typeof stop === "string" ? stop : stop.name;

        if (stopName === from || stopName === to)
            return;

        const firstLeg =
            findConnections(from, stopName, afterTime);

        firstLeg.forEach(first => {

            const secondLeg =
                findConnections(
                    stopName,
                    to,
                    first.arrival
                );

            secondLeg.forEach(second => {

                if (
                    timeToMinutes(second.departure) <
                    timeToMinutes(first.arrival)
                ) {
                    return;
                }

                results.push({

                    transfer: true,

                    stop: stopName,

                    first: first,

                    second: second,

                    departureMinutes:
                        first.departureMinutes

                });

            });

        });

    });

    results.sort((a, b) =>
        a.departureMinutes - b.departureMinutes
    );

    return results;
}

// ===============================
// Načtení aplikace
// ===============================

async function initializeAnaIDOS() {

    await loadRoutes();

    await loadStops();

    await loadTimetables();

    console.log("Ana IDOS připraven.");

}

window.addEventListener("load", initializeAnaIDOS);
