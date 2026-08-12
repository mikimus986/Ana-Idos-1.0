// search.js

window.searchTimetable = (() => {

    const cache = new Map();

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

        const parts =
            String(time).split(":");

        if (parts.length !== 2) {
            return 0;
        }

        const h =
            Number(parts[0]);

        const m =
            Number(parts[1]);

        if (
            !Number.isFinite(h) ||
            !Number.isFinite(m)
        ) {
            return 0;
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


    // =====================================================
    // NORMALIZACE NÁZVU ZASTÁVKY
    // =====================================================

    function normalizeStop(name) {

        return String(name)
            .trim()
            .toLowerCase()
            .replace(/\s+/g, " ");
    }


    // =====================================================
    // PARSOVÁNÍ ODJEZDU
    //
    // například:
    // 22
    // 41S
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
    // VYTVOŘENÍ JEDNOTLIVÝCH SPOJŮ
    // =====================================================

    function createTrips(
        line,
        direction,
        dayType
    ) {

        const trips = [];

        let timetable =
            direction[dayType];

        // ochrana pro různé názvy
        if (!timetable) {

            if (dayType === "weekday") {
                timetable =
                    direction.weekdays;
            }

            if (dayType === "weekend") {
                timetable =
                    direction.weekends;
            }
        }

        if (!timetable) {
            return trips;
        }


        if (!Array.isArray(direction.stops)) {
            return trips;
        }


        // =================================================
        // JEDNOTLIVÉ HODINY
        // =================================================

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


            // =================================================
            // JEDNOTLIVÉ ODJEZDY
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
                // POČET ZASTÁVEK
                // =================================================

                let stopCount =
                    direction.stops.length;

                let destination =
                    direction.destination ||
                    direction.stops[
                        direction.stops.length - 1
                    ];


                // =================================================
                // SPOJ S
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


                // =================================================
                // VYTVOŘENÍ ZASTÁVEK
                // =================================================

                const stops = [];


                for (
                    let i = 0;
                    i < stopCount;
                    i++
                ) {

                    const stopName =
                        direction.stops[i];

                    if (!stopName) {
                        continue;
                    }


                    let travelTime = 0;


                    if (
                        Array.isArray(
                            direction.travelTimes
                        )
                    ) {

                        travelTime =
                            Number(
                                direction.travelTimes[i]
                            );

                    } else {

                        travelTime = 0;
                    }


                    if (
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
                        `${line}-${direction.id || destination}-${firstTime}-${parsed.isShortTrip ? "S" : "N"}`,

                    line:
                        String(line),

                    directionId:
                        direction.id || "",

                    destination,

                    isShortTrip:
                        parsed.isShortTrip,

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
    // SPOJE VŠECH LINEK
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
    // NAJDI ÚSEK SPOJE
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


        // nesmí jet opačným směrem
        if (
            fromIndex >= toIndex
        ) {
            return null;
        }


        return {

            fromIndex,
            toIndex,

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


        return results;
    }


    // =====================================================
    // NAJDI SPOJ Z JEDNÉ ZASTÁVKY NA DRUHOU
    // =====================================================

    function makeLeg(
        trip,
        from,
        to
    ) {

        const segment =
            getSegment(
                trip,
                from,
                to
            );

        if (!segment) {
            return null;
        }


        return {

            line:
                trip.line,

            directionId:
                trip.directionId,

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
                segment.stops,

            trip
        };
    }


    // =====================================================
    // SPOJENÍ DVOU SPOJŮ
    // =====================================================

    function createTwoLegConnections(
        allTrips,
        from,
        to,
        wantedTime,
        mode
    ) {

        const results = [];


        for (
            const firstTrip
            of allTrips
        ) {

            const firstFromIndex =
                firstTrip.stops.findIndex(
                    stop =>
                        normalizeStop(
                            stop.name
                        ) ===
                        normalizeStop(from)
                );


            if (firstFromIndex === -1) {
                continue;
            }


            // ---------------------------------------------
            // všechny zastávky první linky
            // ---------------------------------------------

            for (
                let i = firstFromIndex + 1;
                i < firstTrip.stops.length;
                i++
            ) {

                const transferStop =
                    firstTrip.stops[i].name;


                // -----------------------------------------
                // první část
                // -----------------------------------------

                const firstLeg =
                    makeLeg(
                        firstTrip,
                        from,
                        transferStop
                    );


                if (!firstLeg) {
                    continue;
                }


                if (
                    mode === "departure" &&
                    firstLeg.departureMinutes <
                    wantedTime
                ) {
                    continue;
                }


                // -----------------------------------------
                // hledání druhého spoje
                // -----------------------------------------

                for (
                    const secondTrip
                    of allTrips
                ) {

                    // stejný spoj nedává přestup
                    if (
                        secondTrip.id ===
                        firstTrip.id
                    ) {
                        continue;
                    }


                    const secondTransferIndex =
                        secondTrip.stops.findIndex(
                            stop =>
                                normalizeStop(
                                    stop.name
                                ) ===
                                normalizeStop(
                                    transferStop
                                )
                        );


                    if (
                        secondTransferIndex === -1
                    ) {
                        continue;
                    }


                    const destinationIndex =
                        secondTrip.stops.findIndex(
                            (stop, index) =>
                                index >
                                secondTransferIndex &&
                                normalizeStop(
                                    stop.name
                                ) ===
                                normalizeStop(to)
                        );


                    if (
                        destinationIndex === -1
                    ) {
                        continue;
                    }


                    const secondDeparture =
                        secondTrip.stops[
                            secondTransferIndex
                        ];


                    // -------------------------------------
                    // minimální čas na přestup
                    // -------------------------------------

                    const transferWait =
                        secondDeparture.minutes -
                        firstLeg.arrivalMinutes;


                    // minimálně 1 minuta
                    if (
                        transferWait < 1
                    ) {
                        continue;
                    }


                    const secondLeg =
                        makeLeg(
                            secondTrip,
                            transferStop,
                            to
                        );


                    if (!secondLeg) {
                        continue;
                    }


                    results.push({

                        type:
                            "transfer",

                        legs: [
                            firstLeg,
                            secondLeg
                        ],

                        transferCount:
                            1,

                        transferStops: [
                            transferStop
                        ],

                        departure:
                            firstLeg.departure,

                        arrival:
                            secondLeg.arrival,

                        departureMinutes:
                            firstLeg.departureMinutes,

                        arrivalMinutes:
                            secondLeg.arrivalMinutes,

                        duration:
                            secondLeg.arrivalMinutes -
                            firstLeg.departureMinutes

                    });


                    // důležité:
                    // jakmile máme první vhodný
                    // společný přestupní bod,
                    // nehledáme horší pozdější
                    // variantu stejné dvojice
                    break;
                }
            }
        }


        return results;
    }


    // =====================================================
    // OBECNÉ VYHLEDÁVÁNÍ PŘESTUPŮ
    //
    // MAX 4 PŘESTUPY
    // = maximálně 5 LINEK
    // =====================================================

    function findTransferConnections(
        allTrips,
        from,
        to,
        wantedTime,
        mode,
        maxTransfers = 4
    ) {

        const results = [];


        // -------------------------------------------------
        // stav cesty
        // -------------------------------------------------

        const queue = [];


        // -------------------------------------------------
        // všechny možné první spoje
        // -------------------------------------------------

        for (
            const trip
            of allTrips
        ) {

            const startIndex =
                trip.stops.findIndex(
                    stop =>
                        normalizeStop(
                            stop.name
                        ) ===
                        normalizeStop(from)
                );


            if (startIndex === -1) {
                continue;
            }


            const departureStop =
                trip.stops[startIndex];


            if (
                mode === "departure" &&
                departureStop.minutes <
                wantedTime
            ) {
                continue;
            }


            queue.push({

                trips: [
                    trip
                ],

                legs: [],

                currentStop:
                    departureStop.name,

                currentTime:
                    departureStop.minutes,

                visitedLines: [
                    trip.line
                ],

                transferStops: [],

                firstDeparture:
                    departureStop.minutes

            });
        }


        // -------------------------------------------------
        // ochrana proti nekonečnému hledání
        // -------------------------------------------------

        let iterations = 0;

        const MAX_ITERATIONS = 50000;


        while (
            queue.length > 0 &&
            iterations < MAX_ITERATIONS
        ) {

            iterations++;


            const state =
                queue.shift();


            const lastTrip =
                state.trips[
                    state.trips.length - 1
                ];


            const currentStop =
                state.currentStop;


            // =================================================
            // MŮŽEME JET PŘÍMO DO CÍLE
            // =================================================

            for (
                const candidate
                of allTrips
            ) {

                if (
                    state.trips.includes(
                        candidate
                    )
                ) {
                    continue;
                }


                const fromIndex =
                    candidate.stops.findIndex(
                        stop =>
                            normalizeStop(
                                stop.name
                            ) ===
                            normalizeStop(
                                currentStop
                            )
                    );


                if (fromIndex === -1) {
                    continue;
                }


                const toIndex =
                    candidate.stops.findIndex(
                        (stop, index) =>
                            index >
                            fromIndex &&
                            normalizeStop(
                                stop.name
                            ) ===
                            normalizeStop(to)
                    );


                if (
                    toIndex === -1
                ) {
                    continue;
                }


                const departureStop =
                    candidate.stops[
                        fromIndex
                    ];


                const wait =
                    departureStop.minutes -
                    state.currentTime;


                if (wait < 1) {
                    continue;
                }


                const leg =
                    makeLeg(
                        candidate,
                        currentStop,
                        to
                    );


                if (!leg) {
                    continue;
                }


                const legs = [
                    ...state.legs,
                    leg
                ];


                const transfers =
                    legs.length - 1;


                if (
                    transfers > maxTransfers
                ) {
                    continue;
                }


                results.push({

                    type:
                        "transfer",

                    legs,

                    transferCount:
                        transfers,

                    transferStops:
                        state.transferStops,

                    departure:
                        legs[0].departure,

                    arrival:
                        leg.arrival,

                    departureMinutes:
                        legs[0].departureMinutes,

                    arrivalMinutes:
                        leg.arrivalMinutes,

                    duration:
                        leg.arrivalMinutes -
                        legs[0].departureMinutes

                });
            }


            // =================================================
            // POKRAČOVÁNÍ DALŠÍM PŘESTUPEM
            // =================================================

            const transfersAlready =
                state.trips.length - 1;


            if (
                transfersAlready >=
                maxTransfers
            ) {
                continue;
            }


            // -------------------------------------------------
            // všechny zastávky posledního spoje
            // -------------------------------------------------

            const currentIndex =
                lastTrip.stops.findIndex(
                    stop =>
                        normalizeStop(
                            stop.name
                        ) ===
                        normalizeStop(
                            currentStop
                        )
                );


            if (
                currentIndex === -1
            ) {
                continue;
            }


            // -------------------------------------------------
            // hledáme všechny další linky
            // které sdílejí zastávku
            // -------------------------------------------------

            for (
                let i =
                    currentIndex + 1;
                i <
                    lastTrip.stops.length;
                i++
            ) {

                const possibleTransfer =
                    lastTrip.stops[i];


                const transferStop =
                    possibleTransfer.name;


                const arrivalAtTransfer =
                    possibleTransfer.minutes;


                // ---------------------------------------------
                // najdi další spoje
                // ---------------------------------------------

                for (
                    const nextTrip
                    of allTrips
                ) {

                    if (
                        state.trips.includes(
                            nextTrip
                        )
                    ) {
                        continue;
                    }


                    // stejná linka není skutečný přestup
                    if (
                        state.visitedLines.includes(
                            nextTrip.line
                        )
                    ) {
                        continue;
                    }


                    const nextIndex =
                        nextTrip.stops.findIndex(
                            stop =>
                                normalizeStop(
                                    stop.name
                                ) ===
                                normalizeStop(
                                    transferStop
                                )
                        );


                    if (
                        nextIndex === -1
                    ) {
                        continue;
                    }


                    const nextDeparture =
                        nextTrip.stops[
                            nextIndex
                        ];


                    const wait =
                        nextDeparture.minutes -
                        arrivalAtTransfer;


                    if (
                        wait < 1
                    ) {
                        continue;
                    }


                    // -----------------------------------------
                    // přidej nový stav
                    // -----------------------------------------

                    queue.push({

                        trips: [
                            ...state.trips,
                            nextTrip
                        ],

                        legs:
                            state.legs,

                        currentStop:
                            transferStop,

                        currentTime:
                            nextDeparture.minutes,

                        visitedLines: [
                            ...state.visitedLines,
                            nextTrip.line
                        ],

                        transferStops: [
                            ...state.transferStops,
                            transferStop
                        ],

                        firstDeparture:
                            state.firstDeparture

                    });


                    // -----------------------------------------
                    // první společná vhodná zastávka
                    // -----------------------------------------
                    //
                    // Díky tomu se nebude z jedné
                    // dvojice linek vytvářet několik
                    // téměř stejných přestupů.
                    //
                    break;
                }


                // máme-li vhodný přestup,
                // další zastávky už pro tento směr
                // zbytečně nezkoušíme
                if (
                    queue.some(
                        item =>
                            item.currentStop ===
                            transferStop
                    )
                ) {
                    break;
                }
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
                connection.type ===
                "direct"
            ) {

                key = [
                    "direct",
                    connection.line,
                    connection.directionId,
                    connection.departure,
                    connection.arrival
                ].join("|");

            } else {

                const legsKey =
                    (connection.legs || [])
                        .map(
                            leg =>
                                [
                                    leg.line,
                                    leg.directionId,
                                    leg.departure,
                                    leg.arrival
                                ].join(":")
                        )
                        .join(">>");


                key =
                    "transfer|" +
                    legsKey;
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
    // ODSTRANĚNÍ HORŠÍCH PŘESTUPŮ
    //
    // Pokud existuje přímý spoj,
    // přestupy se zobrazí pouze pokud
    // jsou skutečně rychlejší.
    // =====================================================

    function filterTransfers(
        direct,
        transfers
    ) {

        if (
            direct.length === 0
        ) {
            return transfers;
        }


        const bestDirectArrival =
            Math.min(
                ...direct.map(
                    connection =>
                        connection.arrivalMinutes
                )
            );


        const bestDirectDuration =
            Math.min(
                ...direct.map(
                    connection =>
                        connection.arrivalMinutes -
                        connection.departureMinutes
                )
            );


        return transfers.filter(
            transfer => {

                // rychlejší příjezd
                if (
                    transfer.arrivalMinutes <
                    bestDirectArrival
                ) {
                    return true;
                }


                // nebo výrazně kratší doba jízdy
                if (
                    transfer.duration <
                    bestDirectDuration
                ) {
                    return true;
                }


                return false;
            }
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

                    if (
                        a.arrivalMinutes !==
                        b.arrivalMinutes
                    ) {

                        return (
                            a.arrivalMinutes -
                            b.arrivalMinutes
                        );
                    }

                } else {

                    if (
                        a.departureMinutes !==
                        b.departureMinutes
                    ) {

                        return (
                            a.departureMinutes -
                            b.departureMinutes
                        );
                    }
                }


                // pokud je čas stejný,
                // preferuj méně přestupů

                const aTransfers =
                    a.transferCount || 0;

                const bTransfers =
                    b.transferCount || 0;


                if (
                    aTransfers !==
                    bTransfers
                ) {

                    return (
                        aTransfers -
                        bTransfers
                    );
                }


                return (
                    (a.duration || 0) -
                    (b.duration || 0)
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


        sortConnections(
            direct,
            mode
        );


        // =================================================
        // PŘESTUPNÍ SPOJE
        // =================================================

        let transfers =
            findTransferConnections(
                allTrips,
                from,
                to,
                wantedTime,
                mode,
                4
            );


        transfers =
            removeDuplicates(
                transfers
            );


        // =================================================
        // POKUD EXISTUJE PŘÍMÉ SPOJENÍ
        //
        // přestupy jen pokud jsou rychlejší
        // =================================================

        transfers =
            filterTransfers(
                direct,
                transfers
            );


        sortConnections(
            transfers,
            mode
        );


        // =================================================
        // SPOJENÍ DO VÝSLEDKU
        // =================================================

        let results = [
            ...direct,
            ...transfers
        ];


        // =================================================
        // FINÁLNÍ ŘAZENÍ
        // =================================================

        sortConnections(
            results,
            mode
        );


        // =================================================
        // OMEZENÍ POČTU VÝSLEDKŮ
        // =================================================

        results =
            results.slice(
                0,
                30
            );


        console.log(
            "PŘÍMÉ SPOJE:",
            direct
        );

        console.log(
            "PŘESTUPNÍ SPOJE:",
            transfers
        );

        console.log(
            "CELKEM VÝSLEDKŮ:",
            results.length
        );


        return results;
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
