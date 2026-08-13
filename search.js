// search.js

window.searchTimetable = (() => {

    // =====================================================
    // CACHE
    // =====================================================

    const cache = new Map();


    // =====================================================
    // NASTAVENÍ
    // =====================================================

    // Maximálně 4 přestupy
    const MAX_TRANSFERS = 4;

    // Maximálně 5 částí spoje
    // 1. linka → přestup → 2. linka → ...
    const MAX_LEGS = MAX_TRANSFERS + 1;

    // Minimální čas na přestup v minutách
    const MIN_TRANSFER_TIME = 2;

    // Maximální počet zpracovaných stavů
    // Chrání před zaseknutím vyhledávání
    const MAX_STATES = 2500;

    // Kolik následujících spojů z jedné přestupní
    // zastávky budeme zkoušet
    const MAX_NEXT_DEPARTURES = 3;

    // Maximální počet výsledků
    const MAX_RESULTS = 30;


    // =====================================================
    // NORMALIZACE ZASTÁVKY
    // =====================================================

    function normalizeStop(name) {

        return String(name ?? "")
            .trim()
            .toLowerCase()
            .replace(/\s+/g, " ");
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


        if (cache.has(line)) {

            return cache.get(line);
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
            !Array.isArray(
                data.directions
            )
        ) {

            throw new Error(
                `Jízdní řád linky ${line} nemá platné directions.`
            );
        }


        cache.set(
            line,
            data
        );


        return data;
    }


    // =====================================================
    // ČAS → MINUTY
    // =====================================================

    function timeToMinutes(time) {

        if (!time) {
            return 0;
        }


        const parts =
            String(time)
                .trim()
                .split(":");


        if (
            parts.length !== 2
        ) {
            return 0;
        }


        const hours =
            Number(parts[0]);


        const minutes =
            Number(parts[1]);


        if (
            !Number.isFinite(hours) ||
            !Number.isFinite(minutes)
        ) {

            return 0;
        }


        return (
            hours * 60 +
            minutes
        );
    }


    // =====================================================
    // MINUTY → ČAS
    // =====================================================

    function minutesToTime(minutes) {

        minutes =
            (
                (Number(minutes) % 1440) +
                1440
            ) % 1440;


        const hours =
            Math.floor(
                minutes / 60
            );


        const mins =
            minutes % 60;


        return (
            String(hours).padStart(2, "0") +
            ":" +
            String(mins).padStart(2, "0")
        );
    }


    // =====================================================
    // ODJEZD Z JÍZDNÍHO ŘÁDU
    //
    // Například:
    //
    // 21
    // 41S
    // "21"
    // "41S"
    //
    // S = zkrácený spoj
    // =====================================================

    function parseDeparture(value) {

        const text =
            String(value ?? "")
                .trim()
                .toUpperCase();


        if (!text) {
            return null;
        }


        const isShortTrip =
            text.endsWith("S");


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

            minute:
                minute,

            isShortTrip:
                isShortTrip
        };
    }


    // =====================================================
    // VYTVOŘENÍ VŠECH SPOJŮ Z JEDNOHO SMĚRU
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

            console.warn(
                `Linka ${line}: chybí stops.`
            );

            return trips;
        }


        if (
            !Array.isArray(
                direction.travelTimes
            )
        ) {

            console.warn(
                `Linka ${line}: chybí travelTimes.`
            );

            return trips;
        }


        // =================================================
        // TYP DNE
        // =================================================

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


        // =================================================
        // HODINY
        // =================================================

        for (
            const hourKey
            of Object.keys(timetable)
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


            // =================================================
            // ODJEZDY
            // =================================================

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


                // =================================================
                // CELÁ TRASA
                // =================================================

                let stopCount =
                    direction.stops.length;


                let destination =
                    direction.destination ||
                    "";


                // =================================================
                // ZKRÁCENÝ SPOJ
                // =================================================

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


                // =================================================
                // ZASTÁVKY
                // =================================================

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


                trips.push({

                    id:
                        `${line}-${direction.id ?? "direction"}-${firstTime}-${parsed.isShortTrip ? "S" : "N"}`,

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
    // NAČTENÍ VŠECH SPOJŮ JEDNÉ LINKY
    // =====================================================

    async function getTrips(
        line,
        dayType
    ) {

        const timetable =
            await loadTimetable(
                line
            );


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


        return trips;
    }


    // =====================================================
    // NAČTENÍ VŠECH LINEK
    // =====================================================

    async function loadAllTrips(
        lineNumbers,
        dayType
    ) {

        const allTrips = [];


        if (
            !Array.isArray(
                lineNumbers
            )
        ) {

            return allTrips;
        }


        const promises =
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
            );


        const results =
            await Promise.all(
                promises
            );


        for (
            const trips
            of results
        ) {

            if (
                Array.isArray(
                    trips
                )
            ) {

                allTrips.push(
                    ...trips
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
    // NAJDI ÚSEK SPOJE
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


        const fromNormalized =
            normalizeStop(from);


        const toNormalized =
            normalizeStop(to);


        const fromIndex =
            trip.stops.findIndex(
                stop =>
                    stop &&
                    normalizeStop(
                        stop.name
                    ) ===
                    fromNormalized
            );


        const toIndex =
            trip.stops.findIndex(
                (
                    stop,
                    index
                ) =>
                    index > fromIndex &&
                    stop &&
                    normalizeStop(
                        stop.name
                    ) ===
                    toNormalized
            );


        if (
            fromIndex === -1 ||
            toIndex === -1
        ) {

            return null;
        }


        const departureStop =
            trip.stops[
                fromIndex
            ];


        const arrivalStop =
            trip.stops[
                toIndex
            ];


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
                arrivalStop.minutes
        };
    }


    // =====================================================
    // ÚSEK OD KONKRÉTNÍ POZICE
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


        const toNormalized =
            normalizeStop(to);


        const toIndex =
            trip.stops.findIndex(
                (
                    stop,
                    index
                ) =>
                    index > fromIndex &&
                    stop &&
                    normalizeStop(
                        stop.name
                    ) ===
                    toNormalized
            );


        if (
            toIndex === -1
        ) {

            return null;
        }


        const departureStop =
            trip.stops[
                fromIndex
            ];


        const arrivalStop =
            trip.stops[
                toIndex
            ];


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
                arrivalStop.minutes
        };
    }


    // =====================================================
    // VYTVOŘENÍ LEG
    // =====================================================

    function makeLeg(
        trip,
        segment,
        from,
        to
    ) {

        return {

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


                if (
                    !stop ||
                    !stop.name
                ) {

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


                index
                    .get(key)
                    .push({

                        trip:
                            trip,

                        index:
                            i
                    });
            }
        }


        // =================================================
        // SEŘAZENÍ PODLE ČASU
        // =================================================

        for (
            const occurrences
            of index.values()
        ) {

            occurrences.sort(
                (a, b) => {

                    const aStop =
                        a.trip.stops[
                            a.index
                        ];


                    const bStop =
                        b.trip.stops[
                            b.index
                        ];


                    return (
                        (
                            aStop?.minutes ??
                            Infinity
                        ) -
                        (
                            bStop?.minutes ??
                            Infinity
                        )
                    );
                }
            );
        }


        return index;
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
                segment.departureMinutes <
                wantedTime
            ) {

                continue;
            }


            if (
                mode === "arrival" &&
                segment.arrivalMinutes >
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

            const key = [

                connection.type,

                connection.line,

                connection.departure,

                connection.arrival

            ].join("|");


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
    // SKÓRE PŘESTUPNÍHO SPOJE
    // =====================================================

    function getJourneyScore(
        journey
    ) {

        if (
            !journey ||
            !Array.isArray(
                journey.legs
            ) ||
            journey.legs.length === 0
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


        const waiting =
            journey.totalWaiting || 0;


        const travelTime =
            last.arrivalMinutes -
            first.departureMinutes;


        /*
         * Priorita:
         *
         * 1. dřívější příjezd
         * 2. méně přestupů
         * 3. kratší čekání
         * 4. kratší cesta
         */

        return (

            last.arrivalMinutes * 1000000 +

            transfers * 10000 +

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
            !Array.isArray(
                allTrips
            ) ||
            allTrips.length === 0
        ) {

            return results;
        }


        // =================================================
        // INDEX
        // =================================================

        const stopIndex =
            buildStopIndex(
                allTrips
            );


        const fromKey =
            normalizeStop(
                from
            );


        const startingOccurrences =
            stopIndex.get(
                fromKey
            ) || [];


        if (
            startingOccurrences.length === 0
        ) {

            return results;
        }


        // =================================================
        // FRONTa
        // =================================================

        const queue = [];


        // =================================================
        // STARTOVNÍ SPOJE
        // =================================================

        for (
            const occurrence
            of startingOccurrences
        ) {

            const trip =
                occurrence.trip;


            const index =
                occurrence.index;


            if (
                !trip ||
                !Array.isArray(
                    trip.stops
                )
            ) {

                continue;
            }


            const departureStop =
                trip.stops[
                    index
                ];


            if (
                !departureStop ||
                !Number.isFinite(
                    departureStop.minutes
                )
            ) {

                continue;
            }


            // Musí jet až po požadovaném čase
            if (
                departureStop.minutes <
                wantedTime
            ) {

                continue;
            }


            // Pokud je spoj přímý,
            // bude ho řešit findDirectConnections()
            const directSegment =
                getSegmentFromIndex(
                    trip,
                    index,
                    to
                );


            if (
                directSegment
            ) {

                continue;
            }


            queue.push({

                trip:
                    trip,

                stop:
                    from,

                stopIndex:
                    index,

                legs:
                    [],

                departureMinutes:
                    departureStop.minutes,

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


        // Nejbližší odjezdy první
        queue.sort(
            (a, b) =>
                a.departureMinutes -
                b.departureMinutes
        );


        let processedStates = 0;


        // =================================================
        // PROHLEDÁVÁNÍ
        // =================================================

        while (
            queue.length > 0 &&
            processedStates < MAX_STATES
        ) {

            const state =
                queue.shift();


            processedStates++;


            if (
                !state ||
                !state.trip ||
                !Array.isArray(
                    state.trip.stops
                )
            ) {

                continue;
            }


            const currentTrip =
                state.trip;


            const currentIndex =
                state.stopIndex;


            // =================================================
            // KAŽDÁ DALŠÍ ZASTÁVKA
            // =================================================

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


                if (
                    !Number.isFinite(
                        arrivalAtTransfer
                    )
                ) {

                    continue;
                }


                const occurrences =
                    stopIndex.get(
                        normalizeStop(
                            transferName
                        )
                    ) || [];


                if (
                    occurrences.length === 0
                ) {

                    continue;
                }


                // =================================================
                // JEN NĚKOLIK NEJBLIŽŠÍCH SPOJŮ
                // =================================================

                let checked =
                    0;


                for (
                    const occurrence
                    of occurrences
                ) {

                    if (
                        checked >=
                        MAX_NEXT_DEPARTURES
                    ) {

                        break;
                    }


                    const nextTrip =
                        occurrence.trip;


                    const nextIndex =
                        occurrence.index;


                    if (
                        !nextTrip ||
                        !Array.isArray(
                            nextTrip.stops
                        )
                    ) {

                        continue;
                    }


                    // Stejná linka/spoj
                    if (
                        nextTrip.id ===
                        currentTrip.id
                    ) {

                        continue;
                    }


                    // Zabraň cyklu
                    if (
                        state.visitedTrips.has(
                            nextTrip.id
                        )
                    ) {

                        continue;
                    }


                    const nextDepartureStop =
                        nextTrip.stops[
                            nextIndex
                        ];


                    if (
                        !nextDepartureStop
                    ) {

                        continue;
                    }


                    const nextDeparture =
                        nextDepartureStop.minutes;


                    if (
                        !Number.isFinite(
                            nextDeparture
                        )
                    ) {

                        continue;
                    }


                    // =================================================
                    // MINIMÁLNÍ ČAS NA PŘESTUP
                    // =================================================

                    if (
                        nextDeparture <
                        arrivalAtTransfer +
                        MIN_TRANSFER_TIME
                    ) {

                        continue;
                    }


                    checked++;


                    // =================================================
                    // AKTUÁLNÍ LEG
                    // =================================================

                    const currentLeg =
                        makeLeg(

                            currentTrip,

                            {

                                stops:
                                    currentTrip.stops.slice(
                                        state.stopIndex,
                                        transferIndex + 1
                                    ),

                                departure:
                                    currentTrip.stops[
                                        state.stopIndex
                                    ].time,

                                departureMinutes:
                                    currentTrip.stops[
                                        state.stopIndex
                                    ].minutes,

                                arrival:
                                    transferStop.time,

                                arrivalMinutes:
                                    arrivalAtTransfer
                            },

                            state.stop,

                            transferName
                        );


                    const newLegs =
                        [
                            ...state.legs,
                            currentLeg
                        ];


                    // =================================================
                    // ZKUSÍME CÍL
                    // =================================================

                    const finalSegment =
                        getSegmentFromIndex(
                            nextTrip,
                            nextIndex,
                            to
                        );


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


                        const completeLegs =
                            [
                                ...newLegs,
                                finalLeg
                            ];


                        const waiting =
                            nextDeparture -
                            arrivalAtTransfer;


                        const journey = {

                            type:
                                "transfer",

                            legs:
                                completeLegs,

                            transfers:
                                completeLegs.length - 1,

                            departure:
                                completeLegs[0]
                                    .departure,

                            arrival:
                                finalLeg.arrival,

                            departureMinutes:
                                completeLegs[0]
                                    .departureMinutes,

                            arrivalMinutes:
                                finalLeg
                                    .arrivalMinutes,

                            totalWaiting:
                                state.totalWaiting +
                                waiting,

                            transferStops:
                                completeLegs
                                    .slice(0, -1)
                                    .map(
                                        leg =>
                                            leg.to
                                    )
                        };


                        results.push(
                            journey
                        );


                        continue;
                    }


                    // =================================================
                    // MAX 4 PŘESTUPY
                    // =================================================

                    if (
                        newLegs.length >=
                        MAX_LEGS
                    ) {

                        continue;
                    }


                    // =================================================
                    // DALŠÍ STAV
                    // =================================================

                    const visitedTrips =
                        new Set(
                            state.visitedTrips
                        );


                    visitedTrips.add(
                        nextTrip.id
                    );


                    queue.push({

                        trip:
                            nextTrip,

                        stop:
                            transferName,

                        stopIndex:
                            nextIndex,

                        legs:
                            newLegs,

                        departureMinutes:
                            state.departureMinutes,

                        totalWaiting:
                            state.totalWaiting +
                            (
                                nextDeparture -
                                arrivalAtTransfer
                            ),

                        transfers:
                            newLegs.length - 1,

                        visitedTrips:
                            visitedTrips
                    });
                }
            }


            // =================================================
            // UDRŽUJEME FRONTU SEŘAZENOU
            // =================================================

            if (
                queue.length > 1
            ) {

                queue.sort(
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
                            a.totalWaiting -
                            b.totalWaiting
                        );
                    }
                );
            }
        }


        console.log(
            "PROZKOUMANÉ STAVY:",
            processedStates
        );


        // =================================================
        // ODSTRANĚNÍ DUPLICIT
        // =================================================

        const seen =
            new Set();


        const unique = [];


        for (
            const journey
            of results
        ) {

            if (
                !journey ||
                !Array.isArray(
                    journey.legs
                )
            ) {

                continue;
            }


            const key =
                journey.legs
                    .map(
                        leg =>
                            [
                                leg.line,
                                leg.departure,
                                leg.arrival,
                                leg.from,
                                leg.to
                            ].join(":")
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


        // =================================================
        // SEŘAZENÍ PODLE VÝHODNOSTI
        // =================================================

        unique.sort(
            (a, b) =>
                getJourneyScore(a) -
                getJourneyScore(b)
        );


        return unique.slice(
            0,
            MAX_RESULTS
        );
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
            "=============================="
        );


        console.log(
            "HLEDÁM:",
            from,
            "→",
            to
        );


        console.log(
            "ČAS:",
            afterTime
        );


        console.log(
            "DEN:",
            dayType
        );


        console.log(
            "LINKY:",
            lineNumbers
        );


        // =================================================
        // KONTROLA
        // =================================================

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

            console.error(
                "Nebyly předány žádné linky."
            );


            return [];
        }


        const wantedTime =
            timeToMinutes(
                afterTime ||
                "00:00"
            );


        // =================================================
        // NAČTENÍ VŠECH SPOJŮ
        // =================================================

        const allTrips =
            await loadAllTrips(
                lineNumbers,
                dayType
            );


        console.log(
            "NAČTENÉ SPOJE:",
            allTrips.length
        );


        if (
            allTrips.length === 0
        ) {

            console.error(
                "Nebyly načteny žádné spoje."
            );


            return [];
        }


        // =================================================
        // PŘÍMÉ SPOJE
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


        // =================================================
        // PŘESTUPNÍ SPOJE
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
                    wantedTime
                );
        }


        // =================================================
        // SPOJENÍ
        // =================================================

        const allConnections =
            [
                ...direct,
                ...transfers
            ];


        // =================================================
        // ODSTRANĚNÍ DUPLICIT
        // =================================================

        const unique = [];


        const seen =
            new Set();


        for (
            const connection
            of allConnections
        ) {

            if (
                connection.type ===
                "transfer"
            ) {

                const key =
                    connection.legs
                        .map(
                            leg =>
                                [
                                    leg.line,
                                    leg.departure,
                                    leg.arrival,
                                    leg.from,
                                    leg.to
                                ].join("-")
                        )
                        .join("|");


                if (
                    seen.has(key)
                ) {

                    continue;
                }


                seen.add(key);


                unique.push(
                    connection
                );

            } else {

                const key =
                    [
                        "direct",
                        connection.line,
                        connection.departure,
                        connection.arrival
                    ].join("|");


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
        }


        // =================================================
        // SEŘAZENÍ
        // =================================================

        if (
            mode === "departure"
        ) {

            unique.sort(
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


                    // Při stejném odjezdu
                    // preferujeme méně přestupů

                    const aTransfers =
                        a.type ===
                        "transfer"
                            ? a.transfers
                            : 0;


                    const bTransfers =
                        b.type ===
                        "transfer"
                            ? b.transfers
                            : 0;


                    return (
                        aTransfers -
                        bTransfers
                    );
                }
            );

        } else {

            unique.sort(
                (a, b) =>
                    a.arrivalMinutes -
                    b.arrivalMinutes
            );
        }


        // =================================================
        // LOG
        // =================================================

        console.log(
            "NALEZENÁ SPOJENÍ:",
            unique
        );


        // =================================================
        // VÝSLEDKY
        // =================================================

        return unique.slice(
            0,
            MAX_RESULTS
        );
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
