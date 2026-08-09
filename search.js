// search.js

window.searchTimetable = (() => {

    const cache = new Map();

    // =========================================================
    // NAČTENÍ JÍZDNÍHO ŘÁDU
    // =========================================================

    async function loadTimetable(line) {

        line = String(line);

        if (cache.has(line)) {
            return cache.get(line);
        }

        const response = await fetch(
            `data/timetables/${line}.json`
        );

        if (!response.ok) {
            throw new Error(
                `Nelze načíst jízdní řád linky ${line}. HTTP ${response.status}`
            );
        }

        const data = await response.json();

        cache.set(line, data);

        return data;
    }


    // =========================================================
    // ČAS → MINUTY
    // =========================================================

    function timeToMinutes(time) {

        const parts = String(time).split(":");

        if (parts.length !== 2) {
            return NaN;
        }

        return (
            Number(parts[0]) * 60 +
            Number(parts[1])
        );
    }


    // =========================================================
    // MINUTY → ČAS
    // =========================================================

    function minutesToTime(minutes) {

        minutes = minutes % 1440;

        if (minutes < 0) {
            minutes += 1440;
        }

        const hours =
            Math.floor(minutes / 60);

        const mins =
            minutes % 60;

        return (
            String(hours).padStart(2, "0") +
            ":" +
            String(mins).padStart(2, "0")
        );
    }


    // =========================================================
    // NORMALIZACE NÁZVU ZASTÁVKY
    // =========================================================

    function normalizeStop(name) {

        return String(name)
            .trim()
            .toLowerCase();
    }


    // =========================================================
    // PARSOVÁNÍ ODJEZDU
    //
    // 22
    // 22S
    //
    // =========================================================

    function parseDeparture(value) {

        const text =
            String(value).trim();

        const isShortTrip =
            text.toUpperCase().endsWith("S");

        const numberText =
            isShortTrip
                ? text.slice(0, -1)
                : text;

        const minute =
            Number(numberText);

        if (!Number.isFinite(minute)) {
            return null;
        }

        return {
            minute,
            isShortTrip
        };
    }


    // =========================================================
    // VYTVOŘENÍ SPOJŮ Z JEDNOHO SMĚRU
    // =========================================================

    function createTrips(
        line,
        direction,
        dayType
    ) {

        const trips = [];

        const departures =
            direction[dayType];

        if (!departures) {
            return trips;
        }


        // =====================================================
        // HODINY
        // =====================================================

        for (
            const hour of Object.keys(departures)
        ) {

            const values =
                departures[hour];

            if (!Array.isArray(values)) {
                continue;
            }


            // =================================================
            // JEDNOTLIVÉ ODJEZDY
            // =================================================

            for (
                const value of values
            ) {

                const parsed =
                    parseDeparture(value);

                if (!parsed) {
                    continue;
                }


                const hourNumber =
                    Number(hour);

                if (!Number.isFinite(hourNumber)) {
                    continue;
                }


                const firstTime =
                    hourNumber * 60 +
                    parsed.minute;


                // =================================================
                // POČET ZASTÁVEK
                // =================================================

                let stopCount =
                    direction.stops.length;

                let destination =
                    direction.destination;


                // =================================================
                // SPOJ S
                //
                // Například:
                // 41S
                //
                // končí v:
                // Sminov, u lávky
                // =================================================

                if (parsed.isShortTrip) {

                    const shortStopIndex =
                        direction.stops.findIndex(
                            stop =>
                                normalizeStop(stop) ===
                                "sminov, u lávky"
                        );


                    if (
                        shortStopIndex !== -1
                    ) {

                        stopCount =
                            shortStopIndex + 1;

                        destination =
                            "Sminov, u lávky";
                    }
                }


                // =================================================
                // ZASTÁVKY SPOJE
                // =================================================

                const stops = [];


                for (
                    let i = 0;
                    i < stopCount;
                    i++
                ) {

                    let travelTime =
                        Number(
                            direction.travelTimes?.[i] ?? 0
                        );


                    if (
                        !Number.isFinite(
                            travelTime
                        )
                    ) {
                        travelTime = 0;
                    }


                    const absoluteTime =
                        firstTime +
                        travelTime;


                    stops.push({

                        name:
                            direction.stops[i],

                        minutes:
                            absoluteTime,

                        time:
                            minutesToTime(
                                absoluteTime
                            )
                    });
                }


                if (
                    stops.length === 0
                ) {
                    continue;
                }


                trips.push({

                    line:
                        String(line),

                    destination,

                    isShortTrip:
                        parsed.isShortTrip,

                    stops,

                    departure:
                        stops[0].time,

                    departureMinutes:
                        stops[0].minutes
                });
            }
        }


        return trips;
    }


    // =========================================================
    // VŠECHNY SPOJE LINKY
    // =========================================================

    async function getTrips(
        line,
        dayType
    ) {

        const timetable =
            await loadTimetable(line);

        const trips = [];


        for (
            const direction
            of timetable.directions || []
        ) {

            trips.push(
                ...createTrips(
                    line,
                    direction,
                    dayType
                )
            );
        }


        return trips;
    }


    // =========================================================
    // NALEZENÍ ÚSEKU SPOJE
    // =========================================================

    function getSegment(
        trip,
        from,
        to
    ) {

        const fromIndex =
            trip.stops.findIndex(
                stop =>
                    normalizeStop(stop.name) ===
                    normalizeStop(from)
            );


        const toIndex =
            trip.stops.findIndex(
                stop =>
                    normalizeStop(stop.name) ===
                    normalizeStop(to)
            );


        if (
            fromIndex === -1 ||
            toIndex === -1
        ) {
            return null;
        }


        // =====================================================
        // SPOJ MUSÍ JET SPRÁVNÝM SMĚREM
        // =====================================================

        if (
            fromIndex >= toIndex
        ) {
            return null;
        }


        return {

            stops:
                trip.stops.slice(
                    fromIndex,
                    toIndex + 1
                ),

            departure:
                trip.stops[fromIndex].time,

            departureMinutes:
                trip.stops[fromIndex].minutes,

            arrival:
                trip.stops[toIndex].time,

            arrivalMinutes:
                trip.stops[toIndex].minutes
        };
    }


    // =========================================================
    // PŘÍMÉ SPOJE
    // =========================================================

    async function findDirectConnections(
        from,
        to,
        afterTime,
        dayType,
        lineNumbers
    ) {

        const results = [];

        const wantedTime =
            timeToMinutes(afterTime);


        for (
            const line of lineNumbers
        ) {

            let trips;

            try {

                trips =
                    await getTrips(
                        line,
                        dayType
                    );

            } catch (error) {

                console.warn(
                    `Linka ${line} se nepodařila načíst.`,
                    error
                );

                continue;
            }


            for (
                const trip of trips
            ) {

                const segment =
                    getSegment(
                        trip,
                        from,
                        to
                    );


                if (!segment) {
                    continue;
                }


                if (
                    segment.departureMinutes <
                    wantedTime
                ) {
                    continue;
                }


                results.push({

                    type:
                        "direct",

                    line:
                        trip.line,

                    destination:
                        trip.destination,

                    isShortTrip:
                        trip.isShortTrip,

                    from,

                    to,

                    departure:
                        segment.departure,

                    arrival:
                        segment.arrival,

                    departureMinutes:
                        segment.departureMinutes,

                    arrivalMinutes:
                        segment.arrivalMinutes,

                    stops:
                        segment.stops
                });
            }
        }


        results.sort(
            (a, b) => {

                if (
                    a.departureMinutes !==
                    b.departureMinutes
                ) {
                    return (
                        a.departureMinutes -
                        b.departureMinutes
                    );
                }

                return (
                    a.arrivalMinutes -
                    b.arrivalMinutes
                );
            }
        );


        return removeDuplicateDirects(
            results
        );
    }


    // =========================================================
    // DUPLICITY PŘÍMÝCH SPOJŮ
    // =========================================================

    function removeDuplicateDirects(
        results
    ) {

        const seen =
            new Set();

        const unique = [];


        for (
            const result of results
        ) {

            const key = [
                result.line,
                result.departure,
                result.arrival,
                result.from,
                result.to
            ].join("|");


            if (
                seen.has(key)
            ) {
                continue;
            }


            seen.add(key);

            unique.push(result);
        }


        return unique;
    }


    // =========================================================
    // NAČTENÍ VŠECH LINEK
    // =========================================================

    async function loadAllTrips(
        lineNumbers,
        dayType
    ) {

        const allTrips = [];


        for (
            const line of lineNumbers
        ) {

            try {

                const trips =
                    await getTrips(
                        line,
                        dayType
                    );


                allTrips.push(
                    ...trips
                );

            } catch (error) {

                console.warn(
                    `Nelze načíst linku ${line}:`,
                    error
                );
            }
        }


        return allTrips;
    }


    // =========================================================
    // PŘESTUPNÍ CESTA
    // =========================================================

    function createTransferConnection(
        legs
    ) {

        if (
            !legs ||
            legs.length < 2
        ) {
            return null;
        }


        const first =
            legs[0];

        const last =
            legs[legs.length - 1];


        const connection = {

            type:
                "transfer",

            legs: [],

            from:
                first.from,

            to:
                last.to,

            departure:
                first.departure,

            arrival:
                last.arrival,

            departureMinutes:
                first.departureMinutes,

            arrivalMinutes:
                last.arrivalMinutes
        };


        for (
            const leg of legs
        ) {

            connection.legs.push({

                line:
                    leg.trip.line,

                destination:
                    leg.trip.destination,

                isShortTrip:
                    leg.trip.isShortTrip,

                from:
                    leg.from,

                to:
                    leg.to,

                departure:
                    leg.departure,

                arrival:
                    leg.arrival,

                departureMinutes:
                    leg.departureMinutes,

                arrivalMinutes:
                    leg.arrivalMinutes,

                stops:
                    leg.stops
            });
        }


        // Kompatibilita se starším app.js
        if (
            connection.legs.length >= 2
        ) {

            connection.first =
                connection.legs[0];

            connection.second =
                connection.legs[1];

            connection.transferStop =
                connection.legs[0].to;
        }


        return connection;
    }


    // =========================================================
    // KLÍČ CESTY
    //
    // DŮLEŽITÉ:
    //
    // Do klíče NEPATŘÍ název přestupní zastávky.
    //
    // Rozhoduje:
    //
    // LINKA + ODJEZD + PŘÍJEZD
    //
    // Proto:
    //
    // 2 9:22 → 9:30
    // 1 9:32 → 9:45
    //
    // bude stejná cesta, i když algoritmus ji nalezne
    // přes jinak označenou přestupní zastávku.
    // =========================================================

    function getConnectionKey(
        connection
    ) {

        if (
            !connection
        ) {
            return "";
        }


        if (
            connection.type ===
            "direct"
        ) {

            return [
                "D",
                connection.line,
                connection.departure,
                connection.arrival
            ].join("|");
        }


        if (
            !Array.isArray(
                connection.legs
            )
        ) {
            return "";
        }


        return connection.legs
            .map(
                leg =>
                    [
                        leg.line,
                        leg.departure,
                        leg.arrival
                    ].join("@")
            )
            .join(">>");
    }


    // =========================================================
    // ODSTRANĚNÍ DUPLICIT
    // =========================================================

    function removeDuplicateConnections(
        connections
    ) {

        const seen =
            new Set();

        const unique = [];


        for (
            const connection
            of connections
        ) {

            const key =
                getConnectionKey(
                    connection
                );


            if (
                !key ||
                seen.has(key)
            ) {
                continue;
            }


            seen.add(key);

            unique.push(
                connection
            );
        }


        return unique;
    }


    // =========================================================
    // DALŠÍ MOŽNÉ ÚSEKY
    // =========================================================

    function getPossibleNextLegs(
        allTrips,
        currentStop,
        earliestTime,
        usedLines,
        destination
    ) {

        const results = [];

        const currentStopNormalized =
            normalizeStop(
                currentStop
            );


        for (
            const trip of allTrips
        ) {

            // Stejná linka se nepovažuje za přestup.
            if (
                usedLines.includes(
                    trip.line
                )
            ) {
                continue;
            }


            const fromIndex =
                trip.stops.findIndex(
                    stop =>
                        normalizeStop(
                            stop.name
                        ) ===
                        currentStopNormalized
                );


            if (
                fromIndex === -1
            ) {
                continue;
            }


            const departure =
                trip.stops[
                    fromIndex
                ];


            if (
                departure.minutes <
                earliestTime
            ) {
                continue;
            }


            // =================================================
            // ZKUSÍME JET ROVNOU DO CÍLE
            // =================================================

            const destinationIndex =
                trip.stops.findIndex(
                    (stop, index) =>
                        index > fromIndex &&
                        normalizeStop(
                            stop.name
                        ) ===
                        normalizeStop(
                            destination
                        )
                );


            if (
                destinationIndex !== -1
            ) {

                const arrival =
                    trip.stops[
                        destinationIndex
                    ];


                results.push({

                    trip,

                    from:
                        currentStop,

                    to:
                        destination,

                    fromIndex,

                    toIndex:
                        destinationIndex,

                    departure:
                        departure.time,

                    departureMinutes:
                        departure.minutes,

                    arrival:
                        arrival.time,

                    arrivalMinutes:
                        arrival.minutes,

                    stops:
                        trip.stops.slice(
                            fromIndex,
                            destinationIndex + 1
                        )
                });


                continue;
            }


            // =================================================
            // JINAK LZE POKRAČOVAT NA DALŠÍ ZASTÁVKY
            // =================================================

            for (
                let i =
                    fromIndex + 1;

                i <
                trip.stops.length;

                i++
            ) {

                const stop =
                    trip.stops[i];


                results.push({

                    trip,

                    from:
                        currentStop,

                    to:
                        stop.name,

                    fromIndex,

                    toIndex:
                        i,

                    departure:
                        departure.time,

                    departureMinutes:
                        departure.minutes,

                    arrival:
                        stop.time,

                    arrivalMinutes:
                        stop.minutes,

                    stops:
                        trip.stops.slice(
                            fromIndex,
                            i + 1
                        )
                });
            }
        }


        return results;
    }


    // =========================================================
    // VYHLEDÁVÁNÍ CEST
    //
    // BFS:
    //
    // nejprve 0 přestupů
    // potom 1
    // potom 2
    // potom 3
    // ...
    //
    // Není zde pevný limit počtu přestupů.
    // =========================================================

    function findTransfer

                       
