// search.js

window.searchTimetable = (() => {

    const cache = new Map();

    // =====================================================
    // NASTAVENÍ VYHLEDÁVÁNÍ
    // =====================================================

    const MAX_TRANSFERS = 4;
    const MAX_LEGS = MAX_TRANSFERS + 1;

    // Minimální čas potřebný na přestup
    const MIN_TRANSFER_TIME = 2;

    // Ochrana proti příliš velkému prohledávání
    const MAX_STATES = 5000;

    // Kolik výsledků maximálně vrátíme
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

        line = String(line).trim();

        if (!line) {
            throw new Error("Chybí číslo linky.");
        }

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

        if (!data || !Array.isArray(data.directions)) {
            throw new Error(
                `Jízdní řád linky ${line} nemá platné directions.`
            );
        }

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

        const parts =
            String(time).trim().split(":");

        if (parts.length !== 2) {
            return 0;
        }

        const hour =
            Number(parts[0]);

        const minute =
            Number(parts[1]);

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
    // ODJEZD
    //
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
    // VYTVOŘENÍ SPOJŮ Z JÍZDNÍHO ŘÁDU
    // =====================================================

    function createTrips(
        line,
        direction,
        dayType
    ) {

        const trips = [];


        // -------------------------------------------------
        // OCHRANA PROTI CHYBNÝM DATŮM
        // -------------------------------------------------

        if (
            !direction ||
            typeof direction !== "object"
        ) {
            console.warn(
                `Linka ${line}: přeskočen neplatný směr.`
            );

            return trips;
        }


        if (
            !Array.isArray(direction.stops)
        ) {
            console.warn(
                `Linka ${line}, směr ${direction.id ?? "?"}: chybí stops.`
            );

            return trips;
        }


        if (
            !Array.isArray(direction.travelTimes)
        ) {
            console.warn(
                `Linka ${line}, směr ${direction.id ?? "?"}: chybí travelTimes.`
            );

            return trips;
        }


        // -------------------------------------------------
        // URČENÍ TYPu DNE
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
        // KAŽDÁ HODINA
        // -------------------------------------------------

        for (
            const hourKey of Object.keys(timetable)
        ) {

            const hour =
                Number(hourKey);

            if (!Number.isFinite(hour)) {
                continue;
            }


            const departures =
                timetable[hourKey];


            if (!Array.isArray(departures)) {
                continue;
            }


            // -------------------------------------------------
            // KAŽDÝ ODJEZD
            // -------------------------------------------------

            for (
                const departureValue of departures
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


                const stops = [];


                // -------------------------------------------------
                // VYTVOŘENÍ ZASTÁVEK
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


                if (stops.length < 2) {
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
    // NAČTENÍ VŠECH SPOJŮ LINKY
    // =====================================================

    async function getTrips(
        line,
        dayType
    ) {

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
            const direction of timetable.directions
        ) {

            if (!direction) {
                continue;
            }


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


        if (!Array.isArray(lineNumbers)) {
            return allTrips;
        }


        // Načteme linky současně,
        // aby vyhledávání nebylo zbytečně pomalé.

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
            const trips of results
        ) {

            if (Array.isArray(trips)) {

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
            !Array.isArray(trip.stops)
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
                    ) === fromNormalized
            );


        const toIndex =
            trip.stops.findIndex(
                stop =>
                    stop &&
                    normalizeStop(
                        stop.name
                    ) === toNormalized
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
                arrivalStop.minutes
        };
    }


    // =====================================================
    // INDEX ZASTÁVEK
    //
    // Díky tomu se při přestupech nemusí
    // procházet všechny spoje pokaždé.
    // =====================================================

    function buildStopIndex(
        trips
    ) {

        const index =
            new Map();


        for (
            const trip of trips
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


                if (!index.has(key)) {
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
    // VYTVOŘENÍ ÚSEKU Z POZICE
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


        const toIndex =
            trip.stops.findIndex(
                (stop, index) =>
                    index > fromIndex &&
                    stop &&
                    normalizeStop(
                        stop.name
                    ) ===
                    normalizeStop(to)
            );


        if (toIndex === -1) {
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
            const trip of allTrips
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
            const connection of connections
        ) {

            const key = [

                connection.type,

                connection.line,

                connection.departure,

                connection.arrival

            ].join("|");


            if (seen.has(key)) {
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
    // POROVNÁNÍ VÝHODNOSTI
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


        const waitingTime =
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
         * 4. kratší celková doba
         */

        return (

            last.arrivalMinutes * 1000000 +

            transfers * 10000 +

            waitingTime * 10 +

            travelTime
        );
    }


    // =====================================================
    // NAJDI PŘESTUPNÍ SPOJE
    // =====================================================

    function findTransferConnections(
        allTrips,
        from,
        to,
        wantedTime
    ) {

        const results = [];


        if (
            !Array.isArray(allTrips) ||
            allTrips.length === 0
        ) {
            return results;
        }


        const stopIndex =
            buildStopIndex(
                allTrips
            );


        const fromKey =
            normalizeStop(from);

        const toKey =
            normalizeStop(to);


        const startingOccurrences =
            stopIndex.get(
                fromKey
            ) || [];


        if (
            startingOccurrences.length === 0
        ) {
            return results;
        }


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
                trip.stops[index];


            if (
                !departureStop ||
                !Number.isFinite(
                    departureStop.minutes
                )
            ) {
                continue;
            }


            if (
                departureStop.minutes <
                wantedTime
            ) {
                continue;
            }


            // Přímý cíl
            const directSegment =
                getSegmentFromIndex(
                    trip,
                    index,
                    to
                );


            if (directSegment) {
                continue;
            }


            queue.push({

                trip:
                    trip,

                stop:
                    from,

                stopIndex:
                    index,

                legs: [],

                departureMinutes:
                    departureStop.minutes,

                arrivalMinutes:
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


            const currentStop =
                currentTrip.stops[
                    currentIndex
                ];


            if (!currentStop) {
                continue;
            }


            const currentStopName =
                currentStop.name;


            // =================================================
            // ZKUS VYSTOUPIT NA KAŽDÉ DALŠÍ ZASTÁVCE
            // A NAJÍT ZDE DALŠÍ LINKU
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


                // -------------------------------------------------
                // SPOJE, KTERÉ PROJÍŽDĚJÍ PŘESTUPNÍ ZASTÁVKOU
                // -------------------------------------------------

                const occurrences =
                    stopIndex.get(
                        normalizeStop(
                            transferName
                        )
                    ) || [];


                for (
                    const occurrence
                    of occurrences
                ) {

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


                    // Nemá smysl znovu nastoupit
                    // do stejného spoje.
                    if (
                        nextTrip.id ===
                        currentTrip.id
                    ) {
                        continue;
                    }


                    // Zabraň cyklům.
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


                    // -------------------------------------------------
                    // MINIMÁLNÍ ČAS NA PŘESTUP
                    // -------------------------------------------------

                    if (
                        nextDeparture <
                        arrivalAtTransfer +
                        MIN_TRANSFER_TIME
                    ) {
                        continue;
                    }


                    // -------------------------------------------------
                    // NAJDI CÍL V NOVÉ LINCE
                    // -------------------------------------------------

                    const finalSegment =
                        getSegmentFromIndex(
                            nextTrip,
                            nextIndex,
                            to
                        );


                    // -------------------------------------------------
                    // VYTVOŘENÍ PŘEDCHOZÍCH LEGŮ
                    // -------------------------------------------------

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
                    // CÍL DOSAŽEN V TOMTO SPOJI
                    // =================================================

                    if (finalSegment) {

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
                                completeLegs[0].departure,

                            arrival:
                                finalLeg.arrival,

                            departureMinutes:
                                completeLegs[0].departureMinutes,

                            arrivalMinutes:
                                finalLeg.arrivalMinutes,

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
                    // DALŠÍ PŘESTUP
                    // =================================================

                    if (
                        state.transfers + 1 >=
                        MAX_TRANSFERS
                    ) {
                        continue;
                    }


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

                        arrivalMinutes:
                            nextDeparture,

                        totalWaiting:
                            state.totalWaiting +
                            (
                                nextDeparture -
                                arrivalAtTransfer
                            ),

                        transfers:
                            state.transfers + 1,

                        visitedTrips:
                            visitedTrips
                    });
                }
            }
        }


        console.log(
            "Počet prozkoumaných stavů:",
            processedStates
        );


        // =================================================
        // DUPLICITY
        // =================================================

        const seen =
            new Set();

        const unique = [];


        for (
            const journey of results
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
                            `${leg.line}:${leg.departure}-${leg.arrival}:${leg.from}-${leg.to}`
                    )
                    .join("|");


            if (seen.has(key)) {
                continue;
            }


            seen.add(key);

            unique.push(
                journey
            );
        }


        // =================================================
        // NEJVÝHODNĚJŠÍ SPOJE
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
            "VYHLEDÁVÁNÍ:",
            from,
            "→",
            to,
            afterTime,
            dayType
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


        /*
         * Přestupy nyní hledáme hlavně v režimu
         * ODJEZDY.
         *
         * U příjezdů se zatím zachová správné
         * hledání přímých spojů.
         */

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
        // SPOJENÍ DO JEDNOHO SEZNAMU
        // =================================================

        const allConnections =
            [
                ...direct,
                ...transfers
            ];


        // =================================================
        // ODSTRANĚNÍ DUPLICIT
        // =================================================

        const unique =
            [];


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
                                `${leg.line}-${leg.departure}-${leg.arrival}`
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
                        a.type === "transfer"
                            ? a.departureMinutes
                            : a.departureMinutes;

                    const bDeparture =
                        b.type === "transfer"
                            ? b.departureMinutes
                            : b.departureMinutes;


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

        } else {

            unique.sort(
                (a, b) =>
                    a.arrivalMinutes -
                    b.arrivalMinutes
            );
        }


        console.log(
            "NALEZENÁ SPOJENÍ:",
            unique
        );


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
