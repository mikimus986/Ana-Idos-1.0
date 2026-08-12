// search.js

window.searchTimetable = (() => {

    const cache = new Map();

    // =====================================================
    // NASTAVENÍ
    // =====================================================

    const MAX_TRANSFERS = 4;

    // Minimální čas na přestup
    const TRANSFER_TIME = 1;


    // =====================================================
    // NAČTENÍ JÍZDNÍHO ŘÁDU
    // =====================================================

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
                `Nelze načíst linku ${line}: HTTP ${response.status}`
            );
        }

        const data = await response.json();

        cache.set(line, data);

        return data;
    }


    // =====================================================
    // ČAS
    // =====================================================

    function timeToMinutes(time) {

        if (!time) {
            return 0;
        }

        const parts = String(time).split(":");

        if (parts.length !== 2) {
            return 0;
        }

        return (
            Number(parts[0]) * 60 +
            Number(parts[1])
        );
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


    // =====================================================
    // NORMALIZACE ZASTÁVKY
    // =====================================================

    function normalizeStop(name) {

        return String(name)
            .trim()
            .toLowerCase()
            .replace(/\s+/g, " ");
    }


    // =====================================================
    // ODJEZD
    // =====================================================

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


    // =====================================================
    // VYTVOŘENÍ SPOJŮ
    // =====================================================

    function createTrips(
        line,
        direction,
        dayType
    ) {

        const trips = [];

        let timetable =
            direction[dayType];

        if (!timetable) {

            if (dayType === "weekend") {
                timetable =
                    direction.weekends;
            }

            if (dayType === "weekday") {
                timetable =
                    direction.weekdays;
            }
        }

        if (!timetable) {
            return trips;
        }

        if (!Array.isArray(direction.stops)) {
            return trips;
        }

        if (!Array.isArray(direction.travelTimes)) {
            return trips;
        }


        // =================================================
        // KAŽDÁ HODINA
        // =================================================

        for (const hour of Object.keys(timetable)) {

            const departures =
                timetable[hour];

            if (!Array.isArray(departures)) {
                continue;
            }


            // =================================================
            // KAŽDÝ ODJEZD
            // =================================================

            for (const departureValue of departures) {

                const parsed =
                    parseDeparture(
                        departureValue
                    );

                if (!parsed) {
                    continue;
                }


                const firstTime =
                    Number(hour) * 60 +
                    parsed.minute;


                let stopCount =
                    direction.stops.length;

                let destination =
                    direction.destination || "";


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

                    const stopName =
                        direction.stops[i];

                    const travelTime =
                        Number(
                            direction.travelTimes[i]
                        );

                    if (
                        !stopName ||
                        !Number.isFinite(
                            travelTime
                        )
                    ) {
                        continue;
                    }


                    const absoluteTime =
                        firstTime +
                        travelTime;


                    stops.push({

                        name:
                            stopName,

                        time:
                            minutesToTime(
                                absoluteTime
                            ),

                        minutes:
                            absoluteTime,

                        index:
                            i
                    });
                }


                if (stops.length < 2) {
                    continue;
                }


                trips.push({

                    id:
                        `${line}-${direction.id}-${firstTime}-${parsed.isShortTrip ? "S" : "N"}`,

                    line:
                        String(line),

                    directionId:
                        direction.id,

                    destination:
                        destination,

                    isShortTrip:
                        parsed.isShortTrip,

                    stops:
                        stops
                });
            }
        }


        return trips;
    }


    // =====================================================
    // SPOJE LINKY
    // =====================================================

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


    // =====================================================
    // VŠECHNY SPOJE
    // =====================================================

    async function loadAllTrips(
        lineNumbers,
        dayType
    ) {

        const allTrips = [];


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
                    `Linka ${line} se nepodařila načíst:`,
                    error
                );
            }
        }


        console.log(
            "CELKEM NAČTENÝCH SPOJŮ:",
            allTrips.length
        );


        return allTrips;
    }


    // =====================================================
    // ÚSEK SPOJE
    // =====================================================

    function getSegment(
        trip,
        from,
        to
    ) {

        const fromIndex =
            trip.stops.findIndex(
                stop =>
                    normalizeStop(
                        stop.name
                    ) ===
                    normalizeStop(from)
            );


        const toIndex =
            trip.stops.findIndex(
                stop =>
                    normalizeStop(
                        stop.name
                    ) ===
                    normalizeStop(to)
            );


        if (
            fromIndex === -1 ||
            toIndex === -1
        ) {
            return null;
        }


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
                trip.stops[
                    fromIndex
                ].time,

            departureMinutes:
                trip.stops[
                    fromIndex
                ].minutes,

            arrival:
                trip.stops[
                    toIndex
                ].time,

            arrivalMinutes:
                trip.stops[
                    toIndex
                ].minutes
        };
    }


    // =====================================================
    // PŘÍMÉ SPOJE
    // =====================================================

    function findDirectConnections(
        allTrips,
        from,
        to,
        wantedTime,
        mode
    ) {

        const results = [];


        for (
            const trip
            of allTrips
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
                mode === "departure" &&
                segment.departureMinutes < wantedTime
            ) {
                continue;
            }


            if (
                mode === "arrival" &&
                segment.arrivalMinutes > wantedTime
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

                tripId:
                    trip.id,

                from:
                    from,

                to:
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


        return results;
    }


    // =====================================================
    // NAJDI VŠECHNY MOŽNÉ ÚSEKY Z DANÉ ZASTÁVKY
    //
    // Z jednoho spoje vytvoříme všechny možné cílové
    // zastávky. Díky tomu může algoritmus vybrat
    // nejvýhodnější společnou zastávku pro přestup.
    // =====================================================

    function getReachableSegments(
        trip,
        currentStop,
        earliestDeparture
    ) {

        const currentIndex =
            trip.stops.findIndex(
                stop =>
                    normalizeStop(stop.name) ===
                    normalizeStop(currentStop)
            );


        if (currentIndex === -1) {
            return [];
        }


        const boardingStop =
            trip.stops[currentIndex];


        if (
            boardingStop.minutes <
            earliestDeparture
        ) {
            return [];
        }


        const results = [];


        for (
            let i = currentIndex + 1;
            i < trip.stops.length;
            i++
        ) {

            const target =
                trip.stops[i];


            results.push({

                trip:
                    trip,

                from:
                    boardingStop.name,

                to:
                    target.name,

                departure:
                    boardingStop.time,

                departureMinutes:
                    boardingStop.minutes,

                arrival:
                    target.time,

                arrivalMinutes:
                    target.minutes,

                stops:
                    trip.stops.slice(
                        currentIndex,
                        i + 1
                    )
            });
        }


        return results;
    }


    // =====================================================
    // VYTVOŘENÍ ÚSEKU PRO PŘESTUP
    // =====================================================

    function makeLeg(segment) {

        return {

            line:
                segment.trip.line,

            directionId:
                segment.trip.directionId,

            destination:
                segment.trip.destination,

            isShortTrip:
                segment.trip.isShortTrip,

            tripId:
                segment.trip.id,

            from:
                segment.from,

            to:
                segment.to,

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
        };
    }


    // =====================================================
    // KLÍČ STAVU
    // =====================================================

    function stateKey(
        stop,
        transfers,
        usedTrips
    ) {

        return [
            normalizeStop(stop),
            transfers,
            [...usedTrips]
                .sort()
                .join(",")
        ].join("|");
    }


    // =====================================================
    // PŘESTUPNÍ VYHLEDÁVÁNÍ
    //
    // MAX. 4 PŘESTUPY = MAX. 5 LINEK
    // =====================================================

    function findTransferConnections(
        allTrips,
        from,
        to,
        wantedTime,
        mode
    ) {

        // U příjezdového režimu přestupy zatím
        // vyhledáváme podle času odjezdu.
        // Přímé spoje jsou stále vyhodnoceny správně.
        if (mode === "arrival") {
            return [];
        }


        const results = [];


        // -------------------------------------------------
        // FRONTIER
        // -------------------------------------------------

        let frontier = [

            {
                stop:
                    from,

                earliestTime:
                    wantedTime,

                transfers:
                    0,

                legs:
                    [],

                usedTrips:
                    new Set(),

                usedLines:
                    new Set()
            }

        ];


        const bestStates =
            new Map();


        // -------------------------------------------------
        // AŽ 5 ÚSEKŮ
        // -------------------------------------------------

        for (
            let depth = 0;
            depth <= MAX_TRANSFERS;
            depth++
        ) {

            const nextFrontier = [];


            for (
                const state
                of frontier
            ) {


                // =================================================
                // PRO KAŽDÝ SPOJ
                // =================================================

                for (
                    const trip
                    of allTrips
                ) {

                    // Stejný spoj nemá smysl použít znovu
                    if (
                        state.usedTrips.has(
                            trip.id
                        )
                    ) {
                        continue;
                    }


                    // Počet linek
                    const numberOfLegs =
                        state.legs.length;


                    // Pokud už máme 5 linek,
                    // další přestup není povolen
                    if (
                        numberOfLegs >=
                        MAX_TRANSFERS + 1
                    ) {
                        continue;
                    }


                    const segments =
                        getReachableSegments(
                            trip,
                            state.stop,
                            state.earliestTime
                        );


                    if (
                        segments.length === 0
                    ) {
                        continue;
                    }


                    // =================================================
                    // Z KAŽDÉHO SPOJE VYBEREME JEDNOTLIVÉ
                    // MOŽNÉ CÍLOVÉ ZASTÁVKY
                    // =================================================

                    for (
                        const segment
                        of segments
                    ) {

                        const newLeg =
                            makeLeg(
                                segment
                            );


                        const newLegs =
                            [
                                ...state.legs,
                                newLeg
                            ];


                        // =================================================
                        // DOJEZD DO CÍLE
                        // =================================================

                        if (
                            normalizeStop(
                                segment.to
                            ) ===
                            normalizeStop(to)
                        ) {

                            if (
                                newLegs.length >= 2
                            ) {

                                results.push({

                                    type:
                                        "transfer",

                                    legs:
                                        newLegs,

                                    departure:
                                        newLegs[0].departure,

                                    arrival:
                                        newLegs[
                                            newLegs.length - 1
                                        ].arrival,

                                    departureMinutes:
                                        newLegs[0]
                                            .departureMinutes,

                                    arrivalMinutes:
                                        newLegs[
                                            newLegs.length - 1
                                        ]
                                            .arrivalMinutes,

                                    transfers:
                                        newLegs.length - 1
                                });
                            }


                            continue;
                        }


                        // =================================================
                        // PŘESTUP NA TÉTO ZASTÁVCE
                        // =================================================

                        const newTransfers =
                            newLegs.length - 1;


                        if (
                            newTransfers >
                            MAX_TRANSFERS
                        ) {
                            continue;
                        }


                        const newUsedTrips =
                            new Set(
                                state.usedTrips
                            );

                        newUsedTrips.add(
                            trip.id
                        );


                        const newUsedLines =
                            new Set(
                                state.usedLines
                            );

                        newUsedLines.add(
                            trip.line
                        );


                        // Přestupní čas
                        const nextTime =
                            segment.arrivalMinutes +
                            TRANSFER_TIME;


                        const key =
                            stateKey(
                                segment.to,
                                newTransfers,
                                newUsedTrips
                            );


                        const oldBest =
                            bestStates.get(key);


                        if (
                            oldBest !== undefined &&
                            oldBest <= nextTime
                        ) {
                            continue;
                        }


                        bestStates.set(
                            key,
                            nextTime
                        );


                        nextFrontier.push({

                            stop:
                                segment.to,

                            earliestTime:
                                nextTime,

                            transfers:
                                newTransfers,

                            legs:
                                newLegs,

                            usedTrips:
                                newUsedTrips,

                            usedLines:
                                newUsedLines
                        });
                    }
                }
            }


            frontier =
                nextFrontier;


            if (
                frontier.length === 0
            ) {
                break;
            }
        }


        return results;
    }


    // =====================================================
    // ODSTRANĚNÍ DUPLICIT
    // =====================================================

    function removeDuplicates(
        connections
    ) {

        const seen =
            new Set();

        const result = [];


        for (
            const connection
            of connections
        ) {

            let key;


            if (
                connection.type === "transfer"
            ) {

                key =
                    [
                        "transfer",
                        ...connection.legs.map(
                            leg =>
                                [
                                    leg.line,
                                    leg.tripId,
                                    normalizeStop(
                                        leg.from
                                    ),
                                    normalizeStop(
                                        leg.to
                                    )
                                ].join(":")
                        )
                    ].join("|");

            } else {

                key =
                    [
                        "direct",
                        connection.line,
                        connection.tripId,
                        connection.departure,
                        connection.arrival
                    ].join("|");
            }


            if (
                seen.has(key)
            ) {
                continue;
            }


            seen.add(key);

            result.push(
                connection
            );
        }


        return result;
    }


    // =====================================================
    // ODSTRANĚNÍ STEJNÉHO SPOJE
    //
    // Například stejná linka 2 v 7:22 se zobrazí
    // pouze jednou.
    // =====================================================

    function removeSameDeparture(
        connections
    ) {

        const seen =
            new Set();

        const result = [];


        for (
            const connection
            of connections
        ) {

            let key;


            if (
                connection.type === "transfer"
            ) {

                key =
                    connection.legs
                        .map(
                            leg =>
                                `${leg.line}|${leg.departure}|${leg.tripId}`
                        )
                        .join(">");
            } else {

                key =
                    `${connection.line}|${connection.departure}|${connection.tripId}`;
            }


            if (
                seen.has(key)
            ) {
                continue;
            }


            seen.add(key);

            result.push(
                connection
            );
        }


        return result;
    }


    // =====================================================
    // VÝHODNOST PŘESTUPU
    //
    // Přestupní cesta je zajímavá pouze tehdy,
    // pokud přijede do cíle dříve než nejlepší přímá
    // cesta.
    // =====================================================

    function filterUsefulTransfers(
        direct,
        transfers
    ) {

        if (
            direct.length === 0
        ) {
            return transfers;
        }


        const fastestDirect =
            Math.min(
                ...direct.map(
                    connection =>
                        connection.arrivalMinutes
                )
            );


        return transfers.filter(
            connection =>
                connection.arrivalMinutes <
                fastestDirect
        );
    }


    // =====================================================
    // SEŘAZENÍ
    // =====================================================

    function sortConnections(
        connections,
        mode
    ) {

        connections.sort(
            (a, b) => {

                if (
                    mode === "arrival"
                ) {

                    return (
                        b.arrivalMinutes -
                        a.arrivalMinutes
                    );
                }


                // Nejprve nejdřívější odjezd
                if (
                    a.departureMinutes !==
                    b.departureMinutes
                ) {

                    return (
                        a.departureMinutes -
                        b.departureMinutes
                    );
                }


                // Při stejném odjezdu nejrychlejší
                return (
                    a.arrivalMinutes -
                    b.arrivalMinutes
                );
            }
        );


        return connections;
    }


    // =====================================================
    // HLAVNÍ VYHLEDÁVÁNÍ
    // =====================================================

    async function findConnections(
        from,
        to,
        afterTime,
        dayType,
        lineNumbers,
        mode = "departure"
    ) {

        console.log(
            "VYHLEDÁVÁNÍ:",
            from,
            "→",
            to,
            afterTime,
            dayType,
            mode
        );


        if (
            !from ||
            !to
        ) {
            return [];
        }


        if (
            !Array.isArray(lineNumbers) ||
            lineNumbers.length === 0
        ) {

            console.error(
                "Nejsou předány žádné linky."
            );

            return [];
        }


        const wantedTime =
            timeToMinutes(
                afterTime
            );


        // =================================================
        // NAČTENÍ VŠECH SPOJŮ
        // =================================================

        const allTrips =
            await loadAllTrips(
                lineNumbers,
                dayType
            );


        if (
            allTrips.length === 0
        ) {

            console.error(
                "Nebyl načten žádný spoj."
            );

            return [];
        }


        // =================================================
        // PŘÍMÉ
        // =================================================

        let direct =
            findDirectConnections(
                allTrips,
                from,
                to,
                wantedTime,
                mode
            );


        direct =
            removeDuplicates(
                direct
            );


        direct =
            removeSameDeparture(
                direct
            );


        sortConnections(
            direct,
            mode
        );


        console.log(
            "PŘÍMÉ SPOJE:",
            direct
        );


        // =================================================
        // PŘESTUPY
        // =================================================

        let transfers = [];


        if (
            mode === "departure"
        ) {

            transfers =
                findTransferConnections(
                    allTrips,
                    from,
                    to,
                    wantedTime,
                    mode
                );


            transfers =
                removeDuplicates(
                    transfers
                );


            transfers =
                removeSameDeparture(
                    transfers
                );


            transfers =
                filterUsefulTransfers(
                    direct,
                    transfers
                );


            sortConnections(
                transfers,
                mode
            );
        }


        // =================================================
        // VÝSLEDKY
        //
        // Přímé spoje mají přednost.
        // Přestupy se přidají pouze pokud jsou rychlejší.
        // =================================================

        let finalResults = [];


        finalResults.push(
            ...direct
        );


        finalResults.push(
            ...transfers
        );


        // =================================================
        // OMEZENÍ POČTU VÝSLEDKŮ
        // =================================================

        finalResults =
            finalResults.slice(
                0,
                30
            );


        console.log(
            "KONEČNÉ VÝSLEDKY:",
            finalResults
        );


        return finalResults;
    }


    // =====================================================
    // EXPORT
    // =====================================================

    return {

        loadTimetable,

        findConnections,

        findDirectConnections

    };

})();
