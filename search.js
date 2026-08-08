// search.js

window.searchTimetable = (() => {

    const timetableCache = new Map();

    // ==========================================
    // NAČTENÍ JÍZDNÍHO ŘÁDU
    // ==========================================

    async function loadTimetable(line) {

        line = String(line);

        if (timetableCache.has(line)) {
            return timetableCache.get(line);
        }

        const response = await fetch(
            `data/timetables/${line}.json`
        );

        if (!response.ok) {
            throw new Error(
                `Nelze načíst jízdní řád linky ${line}`
            );
        }

        const data = await response.json();

        timetableCache.set(line, data);

        return data;
    }


    // ==========================================
    // ČAS -> MINUTY
    // ==========================================

    function timeToMinutes(time) {

        const [hours, minutes] =
            time.split(":").map(Number);

        return hours * 60 + minutes;
    }


    // ==========================================
    // MINUTY -> ČAS
    // ==========================================

    function minutesToTime(minutes) {

        minutes = minutes % (24 * 60);

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


    // ==========================================
    // VYTVOŘENÍ VŠECH SPOJŮ JEDNÍM SMĚREM
    // ==========================================

    function createTrips(direction, dayType) {

        const trips = [];

        const departures =
            direction[dayType];

        if (!departures) {
            return trips;
        }


        for (const hour of Object.keys(departures)) {

            const minutes =
                departures[hour];

            if (!Array.isArray(minutes)) {
                continue;
            }


            for (const minute of minutes) {

                const firstDeparture =
                    Number(hour) * 60 +
                    Number(minute);


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


                    const arrival =
                        firstDeparture +
                        travelTime;


                    stops.push({
                        name:
                            direction.stops[i],

                        time:
                            minutesToTime(arrival),

                        minutes:
                            arrival
                    });
                }


                trips.push({
                    destination:
                        direction.destination,

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


    // ==========================================
    // VŠECHNY TRIPY LINKY
    // ==========================================

    async function getTrips(line, dayType) {

        const timetable =
            await loadTimetable(line);

        const trips = [];


        if (!timetable.directions) {
            return trips;
        }


        for (
            const direction
            of timetable.directions
        ) {

            const directionTrips =
                createTrips(
                    direction,
                    dayType
                );


            for (
                const trip
                of directionTrips
            ) {

                trips.push({
                    ...trip,

                    line:
                        String(line)
                });
            }
        }


        return trips;
    }


    // ==========================================
    // NAJDE ÚSEK MEZI DVĚMA ZASTÁVKAMI
    // ==========================================

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
            toIndex === -1 ||
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


    // ==========================================
    // PŘÍMÉ SPOJENÍ
    // ==========================================

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
            (a, b) =>
                a.departureMinutes -
                b.departureMinutes
        );


        return results;
    }


    // ==========================================
    // PŘESTUPNÍ ZASTÁVKY
    // ==========================================

    async function findTransferStops(
        from,
        to,
        firstLine,
        secondLine,
        dayType
    ) {

        const firstTimetable =
            await loadTimetable(firstLine);

        const secondTimetable =
            await loadTimetable(secondLine);


        const firstStops =
            new Set();

        const secondStops =
            new Set();


        for (
            const direction
            of firstTimetable.directions || []
        ) {

            for (
                const stop
                of direction.stops || []
            ) {

                firstStops.add(stop);
            }
        }


        for (
            const direction
            of secondTimetable.directions || []
        ) {

            for (
                const stop
                of direction.stops || []
            ) {

                secondStops.add(stop);
            }
        }


        const transfers = [];


        for (
            const stop
            of firstStops
        ) {

            if (!secondStops.has(stop)) {
                continue;
            }


            if (
                stop.toLowerCase() ===
                from.toLowerCase()
            ) {
                continue;
            }


            if (
                stop.toLowerCase() ===
                to.toLowerCase()
            ) {
                continue;
            }


            transfers.push(stop);
        }


        return transfers;
    }


    // ==========================================
    // PŘESTUPNÍ SPOJENÍ
    // ==========================================

    async function findTransferConnections(
        from,
        to,
        afterTime,
        dayType,
        lineNumbers
    ) {

        const results = [];

        const wantedTime =
            timeToMinutes(afterTime);


        // --------------------------------------
        // PRVNÍ LINKA
        // --------------------------------------

        for (
            const firstLine
            of lineNumbers
        ) {

            let firstTrips;

            try {

                firstTrips =
                    await getTrips(
                        firstLine,
                        dayType
                    );

            } catch (error) {

                continue;
            }


            // ----------------------------------
            // DRUHÁ LINKA
            // ----------------------------------

            for (
                const secondLine
                of lineNumbers
            ) {

                if (
                    String(firstLine) ===
                    String(secondLine)
                ) {
                    continue;
                }


                let transferStops;

                try {

                    transferStops =
                        await findTransferStops(
                            from,
                            to,
                            firstLine,
                            secondLine,
                            dayType
                        );

                } catch (error) {

                    continue;
                }


                // --------------------------------
                // KAŽDÁ MOŽNÁ PŘESTUPNÍ ZASTÁVKA
                // --------------------------------

                for (
                    const transferStop
                    of transferStops
                ) {

                    // ----------------------------
                    // PRVNÍ SPOJ
                    // ----------------------------

                    for (
                        const firstTrip
                        of firstTrips
                    ) {

                        const firstSegment =
                            getSegment(
                                firstTrip,
                                from,
                                transferStop
                            );


                        if (!firstSegment) {
                            continue;
                        }


                        if (
                            firstSegment.departureMinutes <
                            wantedTime
                        ) {
                            continue;
                        }


                        // ------------------------
                        // DRUHÁ LINKA
                        // ------------------------

                        let secondTrips;

                        try {

                            secondTrips =
                                await getTrips(
                                    secondLine,
                                    dayType
                                );

                        } catch (error) {

                            continue;
                        }


                        for (
                            const secondTrip
                            of secondTrips
                        ) {

                            const secondSegment =
                                getSegment(
                                    secondTrip,
                                    transferStop,
                                    to
                                );


                            if (!secondSegment) {
                                continue;
                            }


                            // Druhý spoj musí odjíždět
                            // až po příjezdu prvního.
                            if (
                                secondSegment.departureMinutes <
                                firstSegment.arrivalMinutes
                            ) {
                                continue;
                            }


                            // --------------------------------
                            // VYTVÁŘENÍ VÝSLEDKU
                            // --------------------------------

                            results.push({

                                type:
                                    "transfer",

                                transferStop,

                                departure:
                                    firstSegment.departure,

                                arrival:
                                    secondSegment.arrival,

                                departureMinutes:
                                    firstSegment.departureMinutes,

                                arrivalMinutes:
                                    secondSegment.arrivalMinutes,


                                first: {

                                    line:
                                        firstTrip.line,

                                    destination:
                                        firstTrip.destination,

                                    from,

                                    to:
                                        transferStop,

                                    departure:
                                        firstSegment.departure,

                                    arrival:
                                        firstSegment.arrival,

                                    departureMinutes:
                                        firstSegment.departureMinutes,

                                    arrivalMinutes:
                                        firstSegment.arrivalMinutes,

                                    stops:
                                        firstSegment.stops
                                },


                                second: {

                                    line:
                                        secondTrip.line,

                                    destination:
                                        secondTrip.destination,

                                    from:
                                        transferStop,

                                    to,

                                    departure:
                                        secondSegment.departure,

                                    arrival:
                                        secondSegment.arrival,

                                    departureMinutes:
                                        secondSegment.departureMinutes,

                                    arrivalMinutes:
                                        secondSegment.arrivalMinutes,

                                    stops:
                                        secondSegment.stops
                                }
                            });
                        }
                    }
                }
            }
        }


        // ======================================
        // SEŘAZENÍ
        // ======================================

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


        // ======================================
        // ODSTRANĚNÍ DUPLIKÁTŮ
        // ======================================

        const unique = [];

        const keys = new Set();


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
                    result.second.departure,
                    result.second.arrival
                ].join("|");


            if (keys.has(key)) {
                continue;
            }


            keys.add(key);

            unique.push(result);
        }


        return unique;
    }


    // ==========================================
    // HLAVNÍ VYHLEDÁVÁNÍ
    // ==========================================

    async function findConnections(
        from,
        to,
        afterTime,
        dayType,
        lineNumbers
    ) {

        // --------------------------------------
        // PŘÍMÉ SPOJE
        // --------------------------------------

        const direct =
            await findDirectConnections(
                from,
                to,
                afterTime,
                dayType,
                lineNumbers
            );


        // --------------------------------------
        // PŘESTUPNÍ SPOJE
        // --------------------------------------

        const transfers =
            await findTransferConnections(
                from,
                to,
                afterTime,
                dayType,
                lineNumbers
            );


        // --------------------------------------
        // SPOJENÍ DO JEDNOHO SEZNAMU
        // --------------------------------------

        const results = [
            ...direct,
            ...transfers
        ];


        // --------------------------------------
        // SEŘAZENÍ PODLE ODJEZDU
        // --------------------------------------

        results.sort(
            (a, b) =>
                a.departureMinutes -
                b.departureMinutes
        );


        return results.slice(0, 20);
    }


    // ==========================================
    // VEŘEJNÉ FUNKCE
    // ==========================================

    return {

        loadTimetable,

        findConnections,

        findDirectConnections,

        findTransferConnections
    };

})();
