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

        if (!response.ok) {
            throw new Error(
                `Nelze načíst jízdní řád linky ${line}. HTTP ${response.status}`
            );
        }

        const data = await response.json();

        cache.set(line, data);

        return data;
    }


    // =========================================
    // ČAS
    // =========================================

    function timeToMinutes(time) {

        const parts = time.split(":");

        return (
            Number(parts[0]) * 60 +
            Number(parts[1])
        );
    }


    function minutesToTime(minutes) {

        minutes = minutes % 1440;

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


    // =========================================
    // MINUTA Z JSON
    // =========================================
    // Například:
    // 41
    // 41S
    // =========================================

    function parseDeparture(value) {

        const text =
            String(value).trim();

        const isShortTrip =
            text.endsWith("S");

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


    // =========================================
    // VYTVOŘENÍ SPOJŮ
    // =========================================

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


        for (
            const hour
            of Object.keys(departures)
        ) {

            const values =
                departures[hour];

            if (!Array.isArray(values)) {
                continue;
            }


            for (
                const value
                of values
            ) {

                const parsed =
                    parseDeparture(value);

                if (!parsed) {
                    continue;
                }


                const firstTime =
                    Number(hour) * 60 +
                    parsed.minute;


                const stops = [];


                for (
                    let i = 0;
                    i < direction.stops.length;
                    i++
                ) {

                    const travelTime =
                        Number(
                            direction.travelTimes[i] || 0
                        );


                    const absoluteTime =
                        firstTime + travelTime;


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


                if (stops.length === 0) {
                    continue;
                }


                trips.push({

                    line:
                        String(line),

                    destination:
                        direction.destination,

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


    // =========================================
    // VŠECHNY SPOJE LINKY
    // =========================================

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


    // =========================================
    // NAJÍT ÚSEK
    // =========================================

    function getSegment(
        trip,
        from,
        to
    ) {

        const fromIndex =
            trip.stops.findIndex(
                stop =>
                    stop.name.toLowerCase() ===
                    from.toLowerCase()
            );


        const toIndex =
            trip.stops.findIndex(
                stop =>
                    stop.name.toLowerCase() ===
                    to.toLowerCase()
            );


        if (
            fromIndex === -1 ||
            toIndex === -1
        ) {
            return null;
        }


        if (fromIndex >= toIndex) {
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


    // =========================================
    // PŘÍMÉ SPOJE
    // =========================================

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
            const line
            of lineNumbers
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
                const trip
                of trips
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


        return results;
    }


    // =========================================
    // PŘESTUPNÍ SPOJE
    // =========================================

    async function findTransferConnections(
        from,
        to,
        afterTime,
        dayType,
        lineNumbers
    ) {

        const wantedTime =
            timeToMinutes(afterTime);


        const allTrips = [];


        // Načíst všechny linky
        for (
            const line
            of lineNumbers
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
                    `Nelze načíst linku ${line}`,
                    error
                );
            }
        }


        const results = [];


        // =====================================
        // PRVNÍ SPOJ
        // =====================================

        for (
            const firstTrip
            of allTrips
        ) {

            const fromIndex =
                firstTrip.stops.findIndex(
                    stop =>
                        stop.name.toLowerCase() ===
                        from.toLowerCase()
                );


            if (fromIndex === -1) {
                continue;
            }


            const firstDeparture =
                firstTrip.stops[fromIndex];


            if (
                firstDeparture.minutes <
                wantedTime
            ) {
                continue;
            }


            // =================================
            // MOŽNÉ PŘESTUPNÍ ZASTÁVKY
            // =================================

            for (
                let transferIndex =
                    fromIndex + 1;

                transferIndex <
                firstTrip.stops.length;

                transferIndex++
            ) {

                const transferStop =
                    firstTrip.stops[
                        transferIndex
                    ];


                // =================================
                // DRUHÝ SPOJ
                // =================================

                for (
                    const secondTrip
                    of allTrips
                ) {

                    if (
                        secondTrip.line ===
                        firstTrip.line
                    ) {
                        continue;
                    }


                    const secondTransferIndex =
                        secondTrip.stops.findIndex(
                            stop =>
                                stop.name.toLowerCase() ===
                                transferStop.name.toLowerCase()
                        );


                    if (
                        secondTransferIndex === -1
                    ) {
                        continue;
                    }


                    const destinationIndex =
                        secondTrip.stops.findIndex(
                            stop =>
                                stop.name.toLowerCase() ===
                                to.toLowerCase()
                        );


                    if (
                        destinationIndex === -1
                    ) {
                        continue;
                    }


                    if (
                        secondTransferIndex >=
                        destinationIndex
                    ) {
                        continue;
                    }


                    const secondDeparture =
                        secondTrip.stops[
                            secondTransferIndex
                        ];


                    // Druhý spoj musí odjíždět
                    // po příjezdu prvního.
                    if (
                        secondDeparture.minutes <
                        transferStop.minutes
                    ) {
                        continue;
                    }


                    // =================================
                    // ÚSEK 1
                    // =================================

                    const firstStops =
                        firstTrip.stops.slice(
                            fromIndex,
                            transferIndex + 1
                        );


                    // =================================
                    // ÚSEK 2
                    // =================================

                    const secondStops =
                        secondTrip.stops.slice(
                            secondTransferIndex,
                            destinationIndex + 1
                        );


                    const secondArrival =
                        secondTrip.stops[
                            destinationIndex
                        ];


                    results.push({

                        type:
                            "transfer",

                        departure:
                            firstDeparture.time,

                        arrival:
                            secondArrival.time,

                        departureMinutes:
                            firstDeparture.minutes,

                        arrivalMinutes:
                            secondArrival.minutes,

                        transferStop:
                            transferStop.name,


                        first: {

                            line:
                                firstTrip.line,

                            destination:
                                firstTrip.destination,

                            isShortTrip:
                                firstTrip.isShortTrip,

                            from,

                            to:
                                transferStop.name,

                            departure:
                                firstDeparture.time,

                            arrival:
                                transferStop.time,

                            departureMinutes:
                                firstDeparture.minutes,

                            arrivalMinutes:
                                transferStop.minutes,

                            stops:
                                firstStops
                        },


                        second: {

                            line:
                                secondTrip.line,

                            destination:
                                secondTrip.destination,

                            isShortTrip:
                                secondTrip.isShortTrip,

                            from:
                                transferStop.name,

                            to,

                            departure:
                                secondDeparture.time,

                            arrival:
                                secondArrival.time,

                            departureMinutes:
                                secondDeparture.minutes,

                            arrivalMinutes:
                                secondArrival.minutes,

                            stops:
                                secondStops
                        }
                    });
                }
            }
        }


        // =====================================
        // SEŘAZENÍ
        // =====================================

        results.sort(
            (a, b) =>
                a.arrivalMinutes -
                b.arrivalMinutes
        );


        // =====================================
        // DUPLICITY
        // =====================================

        const unique = [];

        const seen =
            new Set();


        for (
            const result
            of results
        ) {

            const key =
                [
                    result.first.line,
                    result.first.departure,
                    result.transferStop,
                    result.second.line,
                    result.second.departure
                ].join("|");


            if (seen.has(key)) {
                continue;
            }


            seen.add(key);

            unique.push(result);
        }


        return unique;
    }


    // =========================================
    // HLAVNÍ VYHLEDÁVÁNÍ
    // =========================================

    async function findConnections(
        from,
        to,
        afterTime,
        dayType,
        lineNumbers
    ) {

        const direct =
            await findDirectConnections(
                from,
                to,
                afterTime,
                dayType,
                lineNumbers
            );


        const transfers =
            await findTransferConnections(
                from,
                to,
                afterTime,
                dayType,
                lineNumbers
            );


        const all = [
            ...direct,
            ...transfers
        ];


        all.sort(
            (a, b) =>
                a.departureMinutes -
                b.departureMinutes
        );


        return all.slice(
            0,
            30
        );
    }


    return {

        loadTimetable,

        findConnections,

        findDirectConnections,

        findTransferConnections

    };

})();
