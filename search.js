// search.js

async function loadTimetable(line) {
    const response = await fetch(`data/timetables/${line}.json`);

    if (!response.ok) {
        throw new Error(`Nepodařilo se načíst jízdní řád linky ${line}`);
    }

    return await response.json();
}


// Převod "06:21" na počet minut od půlnoci
function timeToMinutes(time) {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes;
}


// Převod minut zpět na "HH:MM"
function minutesToTime(minutes) {
    minutes = minutes % (24 * 60);

    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    return (
        String(hours).padStart(2, "0") +
        ":" +
        String(mins).padStart(2, "0")
    );
}


// Zjistí, jestli je spoj S spoj
function isShortTrip(departure) {
    return String(departure).endsWith("S");
}


// Odstraní S a vrátí normální číslo minuty
function cleanDeparture(departure) {
    return Number(String(departure).replace("S", ""));
}


// Vypočítá čas na konkrétní zastávce
function getStopTime(departureTime, travelTime) {
    const start = timeToMinutes(departureTime);

    return minutesToTime(start + travelTime);
}


// Najde index zastávky
function findStopIndex(stops, stopName) {
    return stops.findIndex(
        stop => stop.toLowerCase() === stopName.toLowerCase()
    );
}


// Vytvoří jeden konkrétní spoj
function createConnection(direction, hour, departure) {

    const shortTrip = isShortTrip(departure);

    const minute = cleanDeparture(departure);

    const departureTime =
        String(hour).padStart(2, "0") +
        ":" +
        String(minute).padStart(2, "0");

    return {
        line: null,
        direction: direction.id,
        destination: direction.destination,

        departure: departureTime,

        isShortTrip: shortTrip,

        stops: direction.stops.map((stop, index) => {

            const travelTime = direction.travelTimes[index] ?? null;

            return {
                name: stop,
                time:
                    travelTime !== null
                        ? getStopTime(departureTime, travelTime)
                        : null
            };
        })
    };
}


// Najde všechny spoje jedné linky
async function findLineConnections(
    line,
    from,
    to,
    afterTime = "00:00",
    dayType = "weekdays"
) {

    const timetable = await loadTimetable(line);

    const results = [];

    const afterMinutes = timeToMinutes(afterTime);

    for (const direction of timetable.directions) {

        const fromIndex = findStopIndex(direction.stops, from);
        const toIndex = findStopIndex(direction.stops, to);

        // Pokud zastávka v tomto směru neexistuje
        if (fromIndex === -1 || toIndex === -1) {
            continue;
        }

        // Spoj musí jet ze "from" směrem k "to"
        if (fromIndex >= toIndex) {
            continue;
        }

        const timetableDays =
            direction[dayType] || {};

        for (const hour of Object.keys(timetableDays)) {

            const departures = timetableDays[hour];

            for (const departure of departures) {

                const connection =
                    createConnection(
                        direction,
                        hour,
                        departure
                    );

                const fromTime =
                    connection.stops[fromIndex].time;

                const toTime =
                    connection.stops[toIndex].time;

                if (!fromTime || !toTime) {
                    continue;
                }

                // Spoj musí odjíždět až po požadovaném čase
                if (timeToMinutes(fromTime) < afterMinutes) {
                    continue;
                }

                // S spoj nesmí pokračovat za Sminov, u lávky
                if (connection.isShortTrip) {

                    const lastStopIndex =
                        connection.stops.findIndex(
                            stop =>
                                stop.name ===
                                "Sminov, u lávky"
                        );

                    if (
                        lastStopIndex !== -1 &&
                        toIndex > lastStopIndex
                    ) {
                        continue;
                    }
                }

                results.push({

                    line: line,

                    direction:
                        direction.id,

                    destination:
                        direction.destination,

                    from: from,

                    to: to,

                    departure: fromTime,

                    arrival: toTime,

                    isShortTrip:
                        connection.isShortTrip,

                    stops:
                        connection.stops
                });
            }
        }
    }

    // Seřadit podle odjezdu
    results.sort(
        (a, b) =>
            timeToMinutes(a.departure) -
            timeToMinutes(b.departure)
    );

    return results;
}


// Najde přímé spoje přes více linek
async function findConnections(
    from,
    to,
    afterTime = "00:00",
    dayType = "weekdays",
    lines = []
) {

    const results = [];

    for (const line of lines) {

        try {

            const connections =
                await findLineConnections(
                    line,
                    from,
                    to,
                    afterTime,
                    dayType
                );

            results.push(
                ...connections
            );

        } catch (error) {

            console.error(
                `Chyba u linky ${line}:`,
                error
            );
        }
    }

    results.sort(
        (a, b) =>
            timeToMinutes(a.departure) -
            timeToMinutes(b.departure)
    );

    return results;
}


// Export funkcí
window.searchTimetable = {
    loadTimetable,
    findLineConnections,
    findConnections,
    getStopTime,
    timeToMinutes,
    minutesToTime
};
