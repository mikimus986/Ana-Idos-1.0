// search.js

window.searchTimetable = (() => {

    // =====================================================
    // CACHE
    // =====================================================

    const timetableCache = new Map();
    const tripsCache = new Map();

    // =====================================================
    // NASTAVENÍ
    // =====================================================

    const MAX_TRANSFERS = 4;
    const MAX_LEGS = MAX_TRANSFERS + 1;

    const MIN_TRANSFER_TIME = 2;

    // Kolik výsledků maximálně vrátit
    const MAX_RESULTS = 20;

    // Maximální počet stavů při hledání přestupů
    const MAX_STATES = 3000;


    // =====================================================
    // NORMALIZACE
    // =====================================================

    function normalizeStop(name) {

        return String(name ?? "")
            .trim()
            .toLowerCase()
            .replace(/\s+/g, " ");
    }


    function normalizeLine(line) {

        return String(line ?? "")
            .trim()
            .toUpperCase();
    }


    // =====================================================
    // ČAS
    // =====================================================

    function timeToMinutes(time) {

        if (!time) {
            return 0;
        }

        const parts =
            String(time)
                .trim()
                .split(":");

        if (parts.length !== 2) {
            return 0;
        }

        const hour = Number(parts[0]);
        const minute = Number(parts[1]);

        if (
            !Number.isFinite(hour) ||
            !Number.isFinite(minute)
        ) {
            return 0;
        }

        return hour * 60 + minute;
    }


    function minutesToTime(minutes) {

        minutes =
            ((Number(minutes) % 1440) + 1440) % 1440;

        const hour =
            Math.floor(minutes / 60);

        const minute =
            minutes % 60;

        return (
            String(hour).padStart(2, "0") +
            ":" +
            String(minute).padStart(2, "0")
        );
    }


    // =====================================================
    // PARSOVÁNÍ ODJEZDU
    //
    // např.
    // 21
    // 41S
    // =====================================================

    function parseDeparture(value) {

        const text =
            String(value ?? "").trim();

        if (!text) {
            return null;
        }

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
    // NAČTENÍ JÍZDNÍHO ŘÁDU
    // =====================================================

    async function loadTimetable(line) {

        line =
            String(line).trim();

        if (!line) {
            throw new Error(
                "Chybí číslo linky."
            );
        }

        if (
            timetableCache.has(line)
        ) {

            return timetableCache.get(line);
        }

        const response =
            await fetch(
                `data/timetables/${encodeURIComponent(line)}.json`
            );

        if (!response.ok) {

            throw new Error(
                `Nelze načíst linku ${line}: HTTP ${response.status}`
            );
        }

        const data =
            await response.json();

        if (
            !data ||
            !Array.isArray(data.directions)
        ) {

            throw new Error(
                `Jízdní řád linky ${line} nemá platné directions.`
            );
        }

        timetableCache.set(
            line,
            data
        );

        return data;
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

        if (
            !direction ||
            typeof direction !== "object"
        ) {
            return trips;
        }

        if (
            !Array.isArray(
                direction.stops
            )
        ) {
            return trips;
        }

        if (
            !Array.isArray(
                direction.travelTimes
            )
        ) {
            return trips;
        }


        // -------------------------------------------------
        // JÍZDNÍ ŘÁD
        // -------------------------------------------------

        let timetable =
            direction[dayType];

        if (
            !timetable &&
            dayType === "weekend"
        ) {
            timetable =
                direction.weekends;
        }

        if (
            !timetable &&
            dayType === "weekday"
        ) {
            timetable =
                direction.weekdays;
        }

        if (!timetable) {
            return trips;
        }


        // -------------------------------------------------
        // HODINY
        // -------------------------------------------------

        for (
            const hourKey of Object.keys(timetable)
        ) {

            const hour =
                Number(hourKey);

            if (
                !Number.isFinite(hour)
            ) {
                continue;
            }

            const departures =
                timetable[hourKey];

            if (
                !Array.isArray(
                    departures
                )
            ) {
                continue;
            }


            // -------------------------------------------------
            // ODJEZDY
            // -------------------------------------------------

            for (
                const departureValue
                of departures
            ) {

                const parsed =
                    parseDeparture(
                        departureValue
                    );

                if (!parsed) {
                    continue;
                }


                const firstTime =
                    hour * 60 +
                    parsed.minute;


                // -------------------------------------------------
                // CELÁ TRASA
                // -------------------------------------------------

                let stopCount =
                    direction.stops.length;

                let destination =
                    direction.destination || "";


                // -------------------------------------------------
                // ZKRÁCENÝ SPOJ S
                // -------------------------------------------------

                if (
                    parsed.isShortTrip
                ) {

                    const shortIndex =
                        direction.stops.findIndex(
                            stop =>
                                normalizeStop(stop) ===
                                normalizeStop(
                                    "Sminov, u lávky"
                                )
                        );

                    if (
                        shortIndex !== -1
                    ) {

                        stopCount =
                            shortIndex + 1;

                        destination =
                            "Sminov, u lávky";
                    }
                }


                const stops = [];


                // -------------------------------------------------
                // ZASTÁVKY
                // -------------------------------------------------

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
                            absoluteTime
                    });
                }


                if (
                    stops.length < 2
                ) {
                    continue;
                }


                // -------------------------------------------------
                // ID KONKRÉTNÍHO SPOJE
                //
                // Stejný autobus/vlak v jízdním řádu
                // = stejné ID.
                // -------------------------------------------------

                const tripId =
                    [
                        normalizeLine(line),
                        String(
                            direction.id ?? ""
                        ),
                        firstTime,
                        parsed.isShortTrip
                            ? "S"
                            : "N"
                    ].join("|");


                trips.push({

                    id:
                        tripId,

                    line:
                        String(line),

                    directionId:
                        direction.id ?? "",

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
    // SPOJE JEDNÉ LINKY
    // =====================================================

    async function getTrips(
        line,
        dayType
    ) {

        const key =
            `${String(line)}|${dayType}`;

        if (
            tripsCache.has(key)
        ) {
            return tripsCache.get(key);
        }

        const timetable =
            await loadTimetable(line);

        const trips = [];


        if (
            !timetable ||
            !Array.isArray(
                timetable.directions
            )
        ) {
            return trips;
        }


        for (
            const direction
            of timetable.directions
        ) {

            trips.push(
                ...createTrips(
                    line,
                    direction,
                    dayType
                )
            );
        }


        tripsCache.set(
            key,
            trips
        );

        return trips;
    }


    // =====================================================
    // VŠECHNY LINKY
    // =====================================================

    async function loadAllTrips(
        lineNumbers,
        dayType
    ) {

        if (
            !Array.isArray(
                lineNumbers
            )
        ) {
            return [];
        }


        // Odstraníme duplicitní čísla linek
        const uniqueLines =
            [
                ...new Set(
                    lineNumbers.map(
                        normalizeLine
                    )
                )
            ];


        const results =
            await Promise.all(
                uniqueLines.map(
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


        const allTrips = [];


        for (
            const trips
            of results
        ) {

            allTrips.push(
                ...trips
            );
        }


        // -------------------------------------------------
        // ABSOLUTNÍ ODSTRANĚNÍ DUPLICITNÍCH SPOJŮ
        // -------------------------------------------------

        const seen =
            new Set();

        const uniqueTrips = [];


        for (
            const trip
            of allTrips
        ) {

            if (!trip) {
                continue;
            }

            if (
                seen.has(
                    trip.id
                )
            ) {
                continue;
            }

            seen.add(
                trip.id
            );

            uniqueTrips.push(
                trip
            );
        }


        console.log(
            "NAČTENO SPOJŮ:",
            uniqueTrips.length
        );


        return uniqueTrips;
    }


    // =====================================================
    // NAJDI ÚSEK
    // =====================================================

    function getSegment(
        trip,
        from,
        to
    ) {

        if (
            !trip ||
            !Array.isArray(
                trip.stops
            )
        ) {
            return null;
        }


        const fromKey =
            normalizeStop(from);

        const toKey =
            normalizeStop(to);


        const fromIndex =
            trip.stops.findIndex(
                stop =>
                    normalizeStop(
                        stop.name
                    ) === fromKey
            );


        if (
            fromIndex === -1
        ) {
            return null;
        }


        const toIndex =
            trip.stops.findIndex(
                (stop, index) =>
                    index > fromIndex &&
                    normalizeStop(
                        stop.name
                    ) === toKey
            );


        if (
            toIndex === -1
        ) {
            return null;
        }


        const departureStop =
            trip.stops[fromIndex];

        const arrivalStop =
            trip.stops[toIndex];


        if (
            !departureStop ||
            !arrivalStop
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
                departureStop.time,

            departureMinutes:
                departureStop.minutes,

            arrival:
                arrivalStop.time,

            arrivalMinutes:
                arrivalStop.minutes,

            fromIndex,
            toIndex
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

        const candidates = [];


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
                mode === "departure"
            ) {

                if (
                    segment.departureMinutes <
                    wantedTime
                ) {
                    continue;
                }

            } else {

                if (
                    segment.arrivalMinutes >
                    wantedTime
                ) {
                    continue;
                }
            }


            candidates.push({

                type:
                    "direct",

                tripId:
                    trip.id,

                line:
                    trip.line,

                directionId:
                    trip.directionId,

                destination:
                    trip.destination,

                isShortTrip:
                    trip.isShortTrip,

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


        // -------------------------------------------------
        // KAŽDÝ KONKRÉTNÍ SPOJ MAX 1×
        // -------------------------------------------------

        const seen =
            new Set();

        const unique = [];


        for (
            const connection
            of candidates
        ) {

            const key =
                connection.tripId;


            if (
                seen.has(key)
            ) {
                continue;
            }


            seen.add(key);

            unique.push(
                connection
            );
        }


        // -------------------------------------------------
        // NEJDŘÍVE ČAS
        // -------------------------------------------------

        unique.sort(
            (a, b) => {

                if (
                    mode === "departure"
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


        return unique;
    }


    // =====================================================
    // INDEX ZASTÁVEK
    // =====================================================

    function buildStopIndex(
        trips
    ) {

        const index =
            new Map();


        for (
            const trip
            of trips
        ) {

            if (
                !trip ||
                !Array.isArray(
                    trip.stops
                )
            ) {
                continue;
            }


            for (
                let i = 0;
                i < trip.stops.length;
                i++
            ) {

                const stop =
                    trip.stops[i];

                if (!stop) {
                    continue;
                }


                const key =
                    normalizeStop(
                        stop.name
                    );


                if (
                    !index.has(key)
                ) {

                    index.set(
                        key,
                        []
                    );
                }


                index.get(key).push({

                    trip:
                        trip,

                    index:
                        i
                });
            }
        }


        return index;
    }


    // =====================================================
    // SEGMENT OD POZICE
    // =====================================================

    function getSegmentFromIndex(
        trip,
        fromIndex,
        to
    ) {

        if (
            !trip ||
            !Array.isArray(
                trip.stops
            )
        ) {
            return null;
        }


        const target =
            normalizeStop(to);


        const toIndex =
            trip.stops.findIndex(
                (stop, index) =>
                    index > fromIndex &&
                    normalizeStop(
                        stop.name
                    ) === target
            );


        if (
            toIndex === -1
        ) {
            return null;
        }


        const departureStop =
            trip.stops[fromIndex];

        const arrivalStop =
            trip.stops[toIndex];


        return {

            stops:
                trip.stops.slice(
                    fromIndex,
                    toIndex + 1
                ),

            departure:
                departureStop.time,

            departureMinutes:
                departureStop.minutes,

            arrival:
                arrivalStop.time,

            arrivalMinutes:
                arrivalStop.minutes
        };
    }


    // =====================================================
    // LEG
    // =====================================================

    function makeLeg(
        trip,
        segment,
        from,
        to
    ) {

        return {

            tripId:
                trip.id,

            line:
                trip.line,

            directionId:
                trip.directionId,

            destination:
                trip.destination,

            isShortTrip:
                trip.isShortTrip,

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
        };
    }


    // =====================================================
    // SKÓRE SPOJE
    //
    // Nejprve skutečný příjezd.
    // Potom počet přestupů.
    // Potom čekání.
    // =====================================================

    function journeyScore(
        journey
    ) {

        if (
            !journey ||
            !Array.isArray(
                journey.legs
            )
        ) {
            return Infinity;
        }


        const first =
            journey.legs[0];

        const last =
            journey.legs[
                journey.legs.length - 1
            ];


        const transfers =
            journey.legs.length - 1;


        const travelTime =
            last.arrivalMinutes -
            first.departureMinutes;


        const waiting =
            journey.totalWaiting || 0;


        return (
            last.arrivalMinutes * 100000 +
            transfers * 1000 +
            waiting * 10 +
            travelTime
        );
    }


    // =====================================================
    // PŘESTUPNÍ SPOJE
    // =====================================================

    function findTransferConnections(
        allTrips,
        from,
        to,
        wantedTime
    ) {

        const results = [];


        if (
            !allTrips.length
        ) {
            return results;
        }


        const stopIndex =
            buildStopIndex(
                allTrips
            );


        const startOccurrences =
            stopIndex.get(
                normalizeStop(from)
            ) || [];


        if (
            startOccurrences.length === 0
        ) {
            return results;
        }


        const queue = [];


        // -------------------------------------------------
        // START
        // -------------------------------------------------

        for (
            const occurrence
            of startOccurrences
        ) {

            const trip =
                occurrence.trip;

            const index =
                occurrence.index;

            const stop =
                trip.stops[index];


            if (!stop) {
                continue;
            }


            if (
                stop.minutes <
                wantedTime
            ) {
                continue;
            }


            // Pokud stejný spoj jede přímo do cíle,
            // nemusíme z něj vytvářet přestupní variantu.
            const direct =
                getSegmentFromIndex(
                    trip,
                    index,
                    to
                );


            if (direct) {
                continue;
            }


            queue.push({

                trip,

                stopIndex:
                    index,

                legs: [],

                totalWaiting:
                    0,

                transfers:
                    0,

                visitedTrips:
                    new Set([
                        trip.id
                    ])
            });
        }


        let processed =
            0;


        // -------------------------------------------------
        // BFS
        // -------------------------------------------------

        while (
            queue.length > 0 &&
            processed < MAX_STATES
        ) {

            const state =
                queue.shift();

            processed++;


            if (
                !state ||
                !state.trip
            ) {
                continue;
            }


            const currentTrip =
                state.trip;


            const currentIndex =
                state.stopIndex;


            // -------------------------------------------------
            // KAŽDÁ DALŠÍ ZASTÁVKA
            // -------------------------------------------------

            for (
                let transferIndex =
                    currentIndex + 1;

                transferIndex <
                currentTrip.stops.length;

                transferIndex++
            ) {

                const transferStop =
                    currentTrip.stops[
                        transferIndex
                    ];


                if (!transferStop) {
                    continue;
                }


                const transferName =
                    transferStop.name;


                const arrivalAtTransfer =
                    transferStop.minutes;


                const occurrences =
                    stopIndex.get(
                        normalizeStop(
                            transferName
                        )
                    ) || [];


                // -------------------------------------------------
                // VŠECHNY MOŽNÉ NÁSLEDUJÍCÍ SPOJE
                // -------------------------------------------------

                for (
                    const occurrence
                    of occurrences
                ) {

                    const nextTrip =
                        occurrence.trip;


                    const nextIndex =
                        occurrence.index;


                    if (!nextTrip) {
                        continue;
                    }


                    // Stejný spoj nepoužívat znovu
                    if (
                        nextTrip.id ===
                        currentTrip.id
                    ) {
                        continue;
                    }


                    // Cyklus
                    if (
                        state.visitedTrips.has(
                            nextTrip.id
                        )
                    ) {
                        continue;
                    }


                    const nextStop =
                        nextTrip.stops[
                            nextIndex
                        ];


                    if (!nextStop) {
                        continue;
                    }


                    const departure =
                        nextStop.minutes;


                    // -------------------------------------------------
                    // ČEKÁNÍ NA PŘESTUP
                    // -------------------------------------------------

                    const waiting =
                        departure -
                        arrivalAtTransfer;


                    if (
                        waiting <
                        MIN_TRANSFER_TIME
                    ) {
                        continue;
                    }


                    // -------------------------------------------------
                    // NAJDI CÍL
                    // -------------------------------------------------

                    const finalSegment =
                        getSegmentFromIndex(
                            nextTrip,
                            nextIndex,
                            to
                        );


                    // -------------------------------------------------
                    // AKTUÁLNÍ LEG
                    // -------------------------------------------------

                    const currentSegment = {

                        stops:
                            currentTrip.stops.slice(
                                currentIndex,
                                transferIndex + 1
                            ),

                        departure:
                            currentTrip.stops[
                                currentIndex
                            ].time,

                        departureMinutes:
                            currentTrip.stops[
                                currentIndex
                            ].minutes,

                        arrival:
                            transferStop.time,

                        arrivalMinutes:
                            arrivalAtTransfer
                    };


                    const currentLeg =
                        makeLeg(
                            currentTrip,
                            currentSegment,
                            state.legs.length === 0
                                ? from
                                : currentTrip.stops[
                                    currentIndex
                                ].name,
                            transferName
                        );


                    const newLegs =
                        [
                            ...state.legs,
                            currentLeg
                        ];


                    // -------------------------------------------------
                    // CÍL DOSAŽEN
                    // -------------------------------------------------

                    if (
                        finalSegment
                    ) {

                        const finalLeg =
                            makeLeg(
                                nextTrip,
                                finalSegment,
                                transferName,
                                to
                            );


                        const legs =
                            [
                                ...newLegs,
                                finalLeg
                            ];


                        if (
                            legs.length >
                            MAX_LEGS
                        ) {
                            continue;
                        }


                        results.push({

                            type:
                                "transfer",

                            legs,

                            transfers:
                                legs.length - 1,

                            departure:
                                legs[0].departure,

                            arrival:
                                finalLeg.arrival,

                            departureMinutes:
                                legs[0].departureMinutes,

                            arrivalMinutes:
                                finalLeg.arrivalMinutes,

                            totalWaiting:
                                state.totalWaiting +
                                waiting,

                            transferStops:
                                legs
                                    .slice(
                                        0,
                                        -1
                                    )
                                    .map(
                                        leg =>
                                            leg.to
                                    )
                        });


                        continue;
                    }


                    // -------------------------------------------------
                    // DALŠÍ PŘESTUP
                    // -------------------------------------------------

                    if (
                        state.transfers + 1 >=
                        MAX_TRANSFERS
                    ) {
                        continue;
                    }


                    const visited =
                        new Set(
                            state.visitedTrips
                        );


                    visited.add(
                        nextTrip.id
                    );


                    queue.push({

                        trip:
                            nextTrip,

                        stopIndex:
                            nextIndex,

                        legs:
                            newLegs,

                        totalWaiting:
                            state.totalWaiting +
                            waiting,

                        transfers:
                            state.transfers + 1,

                        visitedTrips:
                            visited
                    });
                }
            }
        }


        console.log(
            "PROZKOUMÁNO STAVŮ:",
            processed
        );


        // -------------------------------------------------
        // ODSTRANĚNÍ DUPLICIT
        // -------------------------------------------------

        const seen =
            new Set();

        const unique = [];


        for (
            const journey
            of results
        ) {

            const key =
                journey.legs
                    .map(
                        leg =>
                            leg.tripId
                    )
                    .join("|");


            if (
                seen.has(key)
            ) {
                continue;
            }


            seen.add(key);

            unique.push(
                journey
            );
        }


        // -------------------------------------------------
        // NEJLEPŠÍ PŘESTUPY
        // -------------------------------------------------

        unique.sort(
            (a, b) =>
                journeyScore(a) -
                journeyScore(b)
        );


        return unique;
    }


    // =====================================================
    // ODSTRANĚNÍ DUPLICIT
    // =====================================================

    function removeDuplicateConnections(
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
                connection.type ===
                "transfer"
            ) {

                key =
                    [
                        "transfer",
                        ...connection.legs.map(
                            leg =>
                                leg.tripId
                        )
                    ].join("|");

            } else {

                key =
                    [
                        "direct",
                        connection.tripId
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
            normalizeStop(from) ===
            normalizeStop(to)
        ) {
            return [];
        }


        if (
            !Array.isArray(
                lineNumbers
            ) ||
            lineNumbers.length === 0
        ) {
            return [];
        }


        const wantedTime =
            timeToMinutes(
                afterTime
            );


        // -------------------------------------------------
        // NAČTENÍ VŠECH SPOJŮ
        // -------------------------------------------------

        const allTrips =
            await loadAllTrips(
                lineNumbers,
                dayType
            );


        if (
            allTrips.length === 0
        ) {
            return [];
        }


        // -------------------------------------------------
        // PŘÍMÉ SPOJE
        // -------------------------------------------------

        let direct =
            findDirectConnections(
                allTrips,
                from,
                to,
                wantedTime,
                mode
            );


        // -------------------------------------------------
        // DŮLEŽITÉ:
        //
        // Pokud existuje přímý spoj,
        // přestupní spoje se NEZOBRAZÍ
        // před ním.
        //
        // Přímé spoje jsou vždy první.
        // -------------------------------------------------

        let transfers = [];


        if (
            mode === "departure"
        ) {

            transfers =
                findTransferConnections(
                    allTrips,
                    from,
                    to,
                    wantedTime
                );
        }


        // -------------------------------------------------
        // SPOJENÍ
        // -------------------------------------------------

        let connections =
            [
                ...direct,
                ...transfers
            ];


        connections =
            removeDuplicateConnections(
                connections
            );


        // -------------------------------------------------
        // ŘAZENÍ
        // -------------------------------------------------

        connections.sort(
            (a, b) => {

                const aDeparture =
                    a.departureMinutes;

                const bDeparture =
                    b.departureMinutes;


                if (
                    aDeparture !==
                    bDeparture
                ) {

                    return (
                        aDeparture -
                        bDeparture
                    );
                }


                const aTransfers =
                    a.type === "transfer"
                        ? a.transfers
                        : 0;


                const bTransfers =
                    b.type === "transfer"
                        ? b.transfers
                        : 0;


                return (
                    aTransfers -
                    bTransfers
                );
            }
        );


        // -------------------------------------------------
        // VÝBĚR NEJLEPŠÍCH SPOJŮ
        //
        // Pokud je přímá 1 ve 20:00
        // a S1 ve 20:05,
        // 1 bude první.
        //
        // Pokud chceš jen absolutně nejrychlejší
        // spoj, první výsledek je právě ten nejlepší.
        // -------------------------------------------------

        const finalResults =
            connections.slice(
                0,
                MAX_RESULTS
            );


        console.log(
            "VÝSLEDKY:",
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

           
