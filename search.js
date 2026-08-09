// search.js

window.searchTimetable = (() => {

    const cache = new Map();

    // =========================================================
    // NAČTENÍ JÍZDNÍHO ŘÁDU
    // =========================================================

    async function loadTimetable(line) {

        line = String(line).trim();

        if (cache.has(line)) {
            return cache.get(line);
        }

        const response = await fetch(
            `data/timetables/${encodeURIComponent(line)}.json`
        );

        if (!response.ok) {
            throw new Error(
                `Nelze načíst jízdní řád linky ${line}: HTTP ${response.status}`
            );
        }

        const data = await response.json();

        cache.set(line, data);

        return data;
    }


    // =========================================================
    // ČAS
    // =========================================================

    function timeToMinutes(time) {

        const parts = String(time).split(":");

        if (parts.length !== 2) {
            return NaN;
        }

        const h = Number(parts[0]);
        const m = Number(parts[1]);

        if (
            !Number.isFinite(h) ||
            !Number.isFinite(m)
        ) {
            return NaN;
        }

        return h * 60 + m;
    }


    function minutesToTime(minutes) {

        minutes =
            ((minutes % 1440) + 1440) % 1440;

        const h =
            Math.floor(minutes / 60);

        const m =
            minutes % 60;

        return (
            String(h).padStart(2, "0") +
            ":" +
            String(m).padStart(2, "0")
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
    // ODJEZD
    //
    // 11  = 11. minuta
    // 11S = 11. minuta + speciální spoj
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

        if (
            !Number.isFinite(minute) ||
            minute < 0 ||
            minute > 59
        ) {
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


        for (
            const hour of Object.keys(departures)
        ) {

            const values =
                departures[hour];

            if (!Array.isArray(values)) {
                continue;
            }


            for (
                const value of values
            ) {

                const parsed =
                    parseDeparture(value);

                if (!parsed) {
                    continue;
                }


                const firstTime =
                    Number(hour) * 60 +
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
                // =================================================

                if (parsed.isShortTrip) {

                    const shortIndex =
                        direction.stops.findIndex(
                            stop =>
                                normalizeStop(stop) ===
                                normalizeStop(
                                    "Sminov, u lávky"
                                )
                        );

                    if (shortIndex !== -1) {

                        stopCount =
                            shortIndex + 1;

                        destination =
                            "Sminov, u lávky";
                    }
                }


                // =================================================
                // ZASTÁVKY
                // =================================================

                const stops = [];


                for (
                    let i = 0;
                    i < stopCount;
                    i++
                ) {

                    const travelTime =
                        Number(
                            direction.travelTimes?.[i]
                        );

                    if (!Number.isFinite(travelTime)) {
                        continue;
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


                if (stops.length < 2) {
                    continue;
                }


                trips.push({

                    id:
                        `${line}-${direction.id}-${hour}-${parsed.minute}-${parsed.isShortTrip ? "S" : "N"}`,

                    line:
                        String(line),

                    directionId:
                        direction.id,

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
    // SPOJE JEDNÉ LINKY
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
    // VŠECHNY SPOJE
    // =========================================================

    async function loadAllTrips(
        lineNumbers,
        dayType
    ) {

        const results = [];


        const loaded =
            await Promise.all(

                lineNumbers.map(
                    async line => {

                        try {

                            return await getTrips(
                                line,
                                dayType
                            );

                        } catch (error) {

                            console.warn(
                                `Linka ${line} se nepodařila načíst:`,
                                error
                            );

                            return [];
                        }
                    }
                )
            );


        for (
            const trips
            of loaded
        ) {

            results.push(
                ...trips
            );
        }


        return results;
    }


    // =========================================================
    // ÚSEK SPOJE
    // =========================================================

    function makeLeg(
        trip,
        fromIndex,
        toIndex
    ) {

        if (
            fromIndex < 0 ||
            toIndex <= fromIndex
        ) {
            return null;
        }


        const fromStop =
            trip.stops[fromIndex];

        const toStop =
            trip.stops[toIndex];


        return {

            line:
                trip.line,

            destination:
                trip.destination,

            isShortTrip:
                trip.isShortTrip,

            from:
                fromStop.name,

            to:
                toStop.name,

            departure:
                fromStop.time,

            arrival:
                toStop.time,

            departureMinutes:
                fromStop.minutes,

            arrivalMinutes:
                toStop.minutes,

            stops:
                trip.stops.slice(
                    fromIndex,
                    toIndex + 1
                ),

            trip
        };
    }


    // =========================================================
    // PŘÍMÉ SPOJE
    // =========================================================

    function findDirectConnections(
        allTrips,
        from,
        to,
        wantedTime
    ) {

        const results = [];


        const fromKey =
            normalizeStop(from);

        const toKey =
            normalizeStop(to);


        for (
            const trip
            of allTrips
        ) {

            const fromIndex =
                trip.stops.findIndex(
                    stop =>
                        normalizeStop(stop.name) ===
                        fromKey
                );


            const toIndex =
                trip.stops.findIndex(
                    stop =>
                        normalizeStop(stop.name) ===
                        toKey
                );


            if (
                fromIndex === -1 ||
                toIndex === -1 ||
                fromIndex >= toIndex
            ) {
                continue;
            }


            const leg =
                makeLeg(
                    trip,
                    fromIndex,
                    toIndex
                );


            if (!leg) {
                continue;
            }


            if (
                leg.departureMinutes <
                wantedTime
            ) {
                continue;
            }


            results.push({

                type:
                    "direct",

                line:
                    trip.line,

                directionId:
                    trip.directionId,

                destination:
                    trip.destination,

                isShortTrip:
                    trip.isShortTrip,

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


        // =====================================================
        // ODSTRANĚNÍ DUPLICIT
        // =====================================================

        const unique =
            new Map();


        for (
            const connection
            of results
        ) {

            const key = [
                connection.line,
                connection.directionId,
                connection.departure,
                connection.arrival
            ].join("|");


            if (!unique.has(key)) {

                unique.set(
                    key,
                    connection
                );
            }
        }


        return [
            ...unique.values()
        ];
    }


    // =========================================================
    // PŘESTUPY
    // =========================================================

    function findTransfers(
        allTrips,
        from,
        to,
        wantedTime
    ) {

        const results = [];


        const fromKey =
            normalizeStop(from);

        const toKey =
            normalizeStop(to);


        // -----------------------------------------------
        // Všechny možné první spoje
        // -----------------------------------------------

        for (
            const firstTrip
            of allTrips
        ) {

            const firstFromIndex =
                firstTrip.stops.findIndex(
                    stop =>
                        normalizeStop(stop.name) ===
                        fromKey
                );


            if (firstFromIndex === -1) {
                continue;
            }


            const firstDeparture =
                firstTrip.stops[
                    firstFromIndex
                ];


            if (
                firstDeparture.minutes <
                wantedTime
            ) {
                continue;
            }


            // ---------------------------------------------
            // Hledáme první společnou zastávku
            // ---------------------------------------------

            for (
                const secondTrip
                of allTrips
            ) {

                if (
                    secondTrip.id ===
                    firstTrip.id
                ) {
                    continue;
                }


                if (
                    secondTrip.line ===
                    firstTrip.line
                ) {
                    continue;
                }


                const secondToIndex =
                    secondTrip.stops.findIndex(
                        stop =>
                            normalizeStop(stop.name) ===
                            toKey
                    );


                if (secondToIndex === -1) {
                    continue;
                }


                let transferFound =
                    null;


                // -----------------------------------------
                // PRVNÍ SPOLEČNÁ ZASTÁVKA
                // -----------------------------------------

                for (
                    let i =
                        firstFromIndex + 1;

                    i <
                    firstTrip.stops.length;

                    i++
                ) {

                    const firstStop =
                        firstTrip.stops[i];


                    const secondIndex =
                        secondTrip.stops.findIndex(
                            (stop, index) =>
                                index < secondToIndex &&
                                normalizeStop(stop.name) ===
                                normalizeStop(firstStop.name)
                        );


                    if (
                        secondIndex === -1
                    ) {
                        continue;
                    }


                    const secondDeparture =
                        secondTrip.stops[
                            secondIndex
                        ];


                    // Přestup musí být zvládnutelný
                    if (
                        secondDeparture.minutes <=
                        firstStop.minutes
                    ) {
                        continue;
                    }


                    transferFound = {

                        stop:
                            firstStop.name,

                        firstIndex:
                            i,

                        secondIndex,

                        firstStop,

                        secondDeparture
                    };


                    break;
                }


                if (!transferFound) {
                    continue;
                }


                // -----------------------------------------
                // PRVNÍ ÚSEK
                // -----------------------------------------

                const firstLeg =
                    makeLeg(
                        firstTrip,
                        firstFromIndex,
                        transferFound.firstIndex
                    );


                // -----------------------------------------
                // DRUHÝ ÚSEK
                // -----------------------------------------

                const secondLeg =
                    makeLeg(
                        secondTrip,
                        transferFound.secondIndex,
                        secondToIndex
                    );


                if (
                    !firstLeg ||
                    !secondLeg
                ) {
                    continue;
                }


                results.push({

                    type:
                        "transfer",

                    from,

                    to,

                    departure:
                        firstLeg.departure,

                    arrival:
                        secondLeg.arrival,

                    departureMinutes:
                        firstLeg.departureMinutes,

                    arrivalMinutes:
                        secondLeg.arrivalMinutes,

                    transferStop:
                        transferFound.stop,

                    legs: [
                        firstLeg,
                        secondLeg
                    ]
                });
            }
        }


        return results;
    }


    // =========================================================
    // ODSTRANĚNÍ DUPLICIT
    // =========================================================

    function removeDuplicates(
        connections
    ) {

        const map =
            new Map();


        for (
            const connection
            of connections
        ) {

            let key;


            if (
                connection.type ===
                "direct"
            ) {

                key = [
                    "D",
                    connection.line,
                    connection.directionId,
                    connection.departure,
                    connection.arrival
                ].join("|");

            } else {

                key = [
                    "T",
                    connection.legs
                        .map(
                            leg =>
                                `${leg.line}@${leg.departure}@${leg.arrival}`
                        )
                        .join(">"),
                    connection.transferStop
                ].join("|");
            }


            if (!map.has(key)) {

                map.set(
                    key,
                    connection
                );
            }
        }


        return [
            ...map.values()
        ];
    }


    // =========================================================
    // HLAVNÍ VYHLEDÁVÁNÍ
    // =========================================================

    async function findConnections(
        from,
        to,
        afterTime = "00:00",
        dayType = "weekdays",
        lineNumbers = [],
        mode = "departure"
    ) {

        if (!from || !to) {
            return [];
        }


        const wantedTime =
            timeToMinutes(
                afterTime
            );


        if (!Number.isFinite(wantedTime)) {
            return [];
        }


        // =====================================================
        // NAČTENÍ
        // =====================================================

        const allTrips =
            await loadAllTrips(
                lineNumbers,
                dayType
            );


        console.log(
            "Načtené spoje:",
            allTrips.length
        );


        if (!allTrips.length) {
            return [];
        }


        // =====================================================
        // PŘÍMÉ
        // =====================================================

        let direct =
            findDirectConnections(
                allTrips,
                from,
                to,
                wantedTime
            );


        direct =
            removeDuplicates(
                direct
            );


        // =====================================================
        // PŘESTUPY
        // =====================================================

        let transfers =
            findTransfers(
                allTrips,
                from,
                to,
                wantedTime
            );


        transfers =
            removeDuplicates(
                transfers
            );


        // =====================================================
        // NEJRYCHLEJŠÍ PŘÍMÝ SPOJ
        // =====================================================

        let fastestDirect =
            Infinity;


        for (
            const connection
            of direct
        ) {

            if (
                connection.arrivalMinutes <
                fastestDirect
            ) {

                fastestDirect =
                    connection.arrivalMinutes;
            }
        }


        // =====================================================
        // PŘESTUPY POUZE POKUD JSOU RYCHLEJŠÍ
        // =====================================================

        if (
            direct.length > 0
        ) {

            transfers =
                transfers.filter(
                    connection =>
                        connection.arrivalMinutes <
                        fastestDirect
                );
        }


        // =====================================================
        // SPOJENÍ
        // =====================================================

        let results = [
            ...direct,
            ...transfers
        ];


        // =====================================================
        // SEŘAZENÍ
        // =====================================================

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


        return results.slice(
            0,
            30
        );
    }


    // =========================================================
    // EXPORT
    // =========================================================

    return {

        loadTimetable,

        findConnections,

        findDirectConnections

    };

})();
