// search.js

window.searchTimetable = (() => {

    const cache = new Map();

    // =====================================================
    // NASTAVENÍ
    // =====================================================

    const MAX_TRANSFERS = 4;

    // Minimální čas na přestup
    const MIN_TRANSFER_TIME = 1;

    // Kolik výsledků maximálně vrátit
    const MAX_RESULTS = 20;


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

        const h = Number(parts[0]);
        const m = Number(parts[1]);

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
    //
    // 21
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

        // ochrana proti různým názvům
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

        // =================================================
        // KAŽDÁ HODINA
        // =================================================

        for (
            const hour of Object.keys(timetable)
        ) {

            const departures =
                timetable[hour];

            if (!Array.isArray(departures)) {
                continue;
            }

            // =================================================
            // KAŽDÝ ODJEZD
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
                    Number(hour) * 60 +
                    parsed.minute;

                // =================================================
                // CELÁ TRASA
                // =================================================

                let stopCount =
                    direction.stops.length;

                let destination =
                    direction.destination || "";


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

                    const travelTime =
                        Number(
                            direction.travelTimes &&
                            direction.travelTimes[i]
                        );

                    if (
                        !stopName ||
                        !Number.isFinite(travelTime)
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
    // NAČTENÍ SPOJŮ LINKY
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
    // NAČTENÍ VŠECH LINEK
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
    // NAJDI ÚSEK MEZI ZASTÁVKAMI
    // =====================================================

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

        // nesmí jet proti směru
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


    // =====================================================
    // VYTVOŘENÍ PŘÍMÉHO SPOJE
    // =====================================================

    function makeDirectConnection(
        trip,
        segment,
        from,
        to
    ) {

        return {

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
                segment.stops,

            // app může použít i jako jeden úsek
            legs: [{
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
            }],

            transfers: []
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


            results.push(
                makeDirectConnection(
                    trip,
                    segment,
                    from,
                    to
                )
            );
        }

        return results;
    }


    // =====================================================
    // VŠECHNY ZASTÁVKY SPOJE
    // =====================================================

    function getStopIndex(
        trip,
        stopName
    ) {

        return trip.stops.findIndex(
            stop =>
                normalizeStop(stop.name) ===
                normalizeStop(stopName)
        );
    }


    // =====================================================
    // NAJDE VŠECHNA SPOLEČNÁ MÍSTA
    // =====================================================

    function getCommonStops(
        tripA,
        tripB
    ) {

        const result = [];

        for (
            let i = 0;
            i < tripA.stops.length;
            i++
        ) {

            const stopA =
                tripA.stops[i];

            const indexB =
                getStopIndex(
                    tripB,
                    stopA.name
                );

            if (
                indexB === -1
            ) {
                continue;
            }

            result.push({

                name:
                    stopA.name,

                indexA:
                    i,

                indexB:
                    indexB,

                timeA:
                    stopA.minutes,

                timeB:
                    tripB.stops[indexB].minutes
            });
        }

        return result;
    }


    // =====================================================
    // VÝHODNÝ PŘESTUP
    //
    // Vybere přestup, který:
    // 1. umožní stihnout další spoj,
    // 2. má co nejmenší čekání,
    // 3. při shodě je co nejdříve na trase.
    // =====================================================

    function findBestTransfer(
        firstTrip,
        secondTrip,
        currentStop,
        from,
        to,
        wantedTime
    ) {

        const commonStops =
            getCommonStops(
                firstTrip,
                secondTrip
            );

        let best = null;


        for (
            const common
            of commonStops
        ) {

            // přestup musí být až po výjezdu
            // z výchozí zastávky
            if (
                common.timeA < wantedTime
            ) {
                continue;
            }

            // druhý spoj musí být později
            if (
                common.timeB <
                common.timeA +
                MIN_TRANSFER_TIME
            ) {
                continue;
            }


            // první část nesmí pokračovat
            // přes cíl před přestupem
            const firstFromIndex =
                getStopIndex(
                    firstTrip,
                    from
                );

            const firstToTransferIndex =
                common.indexA;


            if (
                firstFromIndex === -1 ||
                firstToTransferIndex <= firstFromIndex
            ) {
                continue;
            }


            // druhá část musí pokračovat
            // z přestupu až do cíle
            const secondTransferIndex =
                common.indexB;

            const secondToIndex =
                getStopIndex(
                    secondTrip,
                    to
                );


            if (
                secondToIndex === -1 ||
                secondToIndex <= secondTransferIndex
            ) {
                continue;
            }


            const waiting =
                common.timeB -
                common.timeA;


            const arrival =
                secondTrip.stops[
                    secondToIndex
                ].minutes;


            const candidate = {

                stop:
                    common.name,

                indexA:
                    common.indexA,

                indexB:
                    common.indexB,

                departureA:
                    firstTrip.stops[
                        firstFromIndex
                    ].minutes,

                arrivalA:
                    common.timeA,

                departureB:
                    common.timeB,

                arrivalB:
                    arrival,

                waiting:
                    waiting
            };


            if (!best) {

                best =
                    candidate;

                continue;
            }


            // nejdříve preferujeme nejmenší čekání
            if (
                candidate.waiting <
                best.waiting
            ) {

                best =
                    candidate;

                continue;
            }


            // při stejném čekání preferujeme
            // dřívější přestup
            if (
                candidate.waiting ===
                best.waiting &&
                candidate.arrivalA <
                best.arrivalA
            ) {

                best =
                    candidate;
            }
        }


        return best;
    }


    // =====================================================
    // VYTVOŘENÍ JEDNOHO ÚSEKU
    // =====================================================

    function createLeg(
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
    // VYTVÁŘENÍ PŘESTUPNÍCH CEST
    // =====================================================

    function buildTransferConnections(
        allTrips,
        from,
        to,
        wantedTime,
        mode
    ) {

        const results = [];

        // =================================================
        // STAV
        //
        // Každý stav obsahuje:
        // aktuální zastávku,
        // poslední spoj,
        // použité spoje,
        // počet přestupů,
        // úseky.
        // =================================================

        const queue = [];


        // =================================================
        // ZAČÁTKY
        // =================================================

        for (
            const trip
            of allTrips
        ) {

            const fromIndex =
                getStopIndex(
                    trip,
                    from
                );

            if (
                fromIndex === -1
            ) {
                continue;
            }

            const departureStop =
                trip.stops[fromIndex];


            if (
                mode === "departure" &&
                departureStop.minutes < wantedTime
            ) {
                continue;
            }


            const toIndex =
                getStopIndex(
                    trip,
                    to
                );


            // Přímé cesty zde nepotřebujeme
            if (
                toIndex !== -1 &&
                toIndex > fromIndex
            ) {
                continue;
            }


            const state = {

                currentStop:
                    trip.stops[
                        trip.stops.length - 1
                    ].name,

                trip:
                    trip,

                usedTrips:
                    new Set([trip.id]),

                legs: [],

                transfers: [],

                departureMinutes:
                    departureStop.minutes,

                currentTime:
                    departureStop.minutes
            };


            queue.push({

                state,
                startIndex:
                    fromIndex
            });
        }


        // =================================================
        // PROHLEDÁVÁNÍ
        // =================================================

        while (
            queue.length > 0
        ) {

            const item =
                queue.shift();

            const state =
                item.state;


            // maximálně 4 přestupy
            if (
                state.transfers.length >=
                MAX_TRANSFERS
            ) {
                continue;
            }


            const lastTrip =
                state.trip;


            // =================================================
            // HLEDÁME DALŠÍ SPOJE
            // =================================================

            for (
                const nextTrip
                of allTrips
            ) {

                // stejný spoj nesmí být použit znovu
                if (
                    state.usedTrips.has(
                        nextTrip.id
                    )
                ) {
                    continue;
                }


                const commonStops =
                    getCommonStops(
                        lastTrip,
                        nextTrip
                    );


                if (
                    commonStops.length === 0
                ) {
                    continue;
                }


                // =================================================
                // VYBER NEJVÝHODNĚJŠÍ PŘESTUP
                // =================================================

                let bestTransfer =
                    null;


                for (
                    const common
                    of commonStops
                ) {

                    if (
                        common.indexA ===
                        lastTrip.stops.length - 1
                    ) {
                        continue;
                    }


                    if (
                        common.timeB <
                        state.currentTime +
                        MIN_TRANSFER_TIME
                    ) {
                        continue;
                    }


                    const targetIndex =
                        getStopIndex(
                            nextTrip,
                            to
                        );


                    if (
                        targetIndex === -1 ||
                        targetIndex <= common.indexB
                    ) {
                        continue;
                    }


                    const candidate = {

                        ...common,

                        targetIndex,

                        waiting:
                            common.timeB -
                            state.currentTime,

                        arrival:
                            nextTrip.stops[
                                targetIndex
                            ].minutes
                    };


                    if (!bestTransfer) {

                        bestTransfer =
                            candidate;

                        continue;
                    }


                    // hlavní kritérium:
                    // co nejdřívější příjezd
                    if (
                        candidate.arrival <
                        bestTransfer.arrival
                    ) {

                        bestTransfer =
                            candidate;

                        continue;
                    }


                    // při shodném příjezdu
                    // co nejkratší čekání
                    if (
                        candidate.arrival ===
                        bestTransfer.arrival &&
                        candidate.waiting <
                        bestTransfer.waiting
                    ) {

                        bestTransfer =
                            candidate;
                    }
                }


                if (!bestTransfer) {
                    continue;
                }


                // =================================================
                // VYTVOŘ ÚSEK
                // =================================================

                const currentFrom =
                    state.legs.length === 0
                        ? from
                        : state.transfers[
                            state.transfers.length - 1
                        ].stop;


                const firstLeg =
                    createLeg(
                        lastTrip,
                        currentFrom,
                        bestTransfer.name
                    );


                if (!firstLeg) {
                    continue;
                }


                // =================================================
                // DALŠÍ ÚSEK
                // =================================================

                const secondLeg =
                    createLeg(
                        nextTrip,
                        bestTransfer.name,
                        to
                    );


                if (!secondLeg) {
                    continue;
                }


                // =================================================
                // HOTOVÁ CESTA
                // =================================================

                const newLegs = [
                    ...state.legs,
                    firstLeg,
                    secondLeg
                ];


                const newTransfers = [
                    ...state.transfers,
                    {
                        stop:
                            bestTransfer.name,

                        arrival:
                            minutesToTime(
                                bestTransfer.arrivalA
                            ),

                        departure:
                            minutesToTime(
                                bestTransfer.departureB
                            ),

                        arrivalMinutes:
                            bestTransfer.arrivalA,

                        departureMinutes:
                            bestTransfer.departureB
                    }
                ];


                const connection = {

                    type:
                        "transfer",

                    from:
                        from,

                    to:
                        to,

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
                        ].arrivalMinutes,

                    legs:
                        newLegs,

                    transfers:
                        newTransfers,

                    transferCount:
                        newTransfers.length,

                    // kvůli kompatibilitě
                    line:
                        newLegs[0].line,

                    directionId:
                        newLegs[0].directionId,

                    destination:
                        newLegs[0].destination,

                    isShortTrip:
                        newLegs[0].isShortTrip,

                    stops:
                        newLegs[0].stops
                };


                results.push(
                    connection
                );


                // =================================================
                // DALŠÍ PŘESTUP
                // =================================================

                if (
                    newTransfers.length <
                    MAX_TRANSFERS
                ) {

                    queue.push({

                        state: {

                            currentStop:
                                bestTransfer.name,

                            trip:
                                nextTrip,

                            usedTrips:
                                new Set([
                                    ...state.usedTrips,
                                    nextTrip.id
                                ]),

                            legs:
                                newLegs,

                            transfers:
                                newTransfers,

                            departureMinutes:
                                newLegs[0]
                                    .departureMinutes,

                            currentTime:
                                bestTransfer.departureB
                        },

                        startIndex:
                            bestTransfer.indexB
                    });
                }
            }
        }


        return results;
    }


    // =====================================================
    // DUPLICITY
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
                    connection.departure,
                    connection.arrival
                ].join("|");

            } else {

                const legs =
                    connection.legs || [];

                key = [
                    "transfer",
                    ...legs.map(
                        leg =>
                            `${leg.line}-${leg.departure}-${leg.arrival}`
                    )
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
    // SEŘAZENÍ
    // =====================================================

    function sortConnections(
        connections,
        mode
    ) {

        if (
            mode === "arrival"
        ) {

            connections.sort(
                (a, b) => {

                    if (
                        a.arrivalMinutes !==
                        b.arrivalMinutes
                    ) {

                        return (
                            a.arrivalMinutes -
                            b.arrivalMinutes
                        );
                    }

                    return (
                        a.departureMinutes -
                        b.departureMinutes
                    );
                }
            );

        } else {

            connections.sort(
                (a, b) => {

                    if (
                        a.arrivalMinutes !==
                        b.arrivalMinutes
                    ) {

                        return (
                            a.arrivalMinutes -
                            b.arrivalMinutes
                        );
                    }

                    return (
                        a.departureMinutes -
                        b.departureMinutes
                    );
                }
            );
        }
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


        sortConnections(
            direct,
            mode
        );


        // =================================================
        // PŘESTUPNÍ
        // =================================================

        let transfers =
            buildTransferConnections(
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


        sortConnections(
            transfers,
            mode
        );


        // =================================================
        // POKUD EXISTUJE PŘÍMÝ SPOJ,
        // PŘESTUPY VRÁTÍME JEN TEHDY,
        // KDYŽ JSOU RYCHLEJŠÍ
        // =================================================

        let finalResults = [];


        if (
            direct.length > 0
        ) {

            const bestDirect =
                direct[0];


            const fasterTransfers =
                transfers.filter(
                    connection =>
                        connection.arrivalMinutes <
                        bestDirect.arrivalMinutes
                );


            finalResults = [
                ...direct,
                ...fasterTransfers
            ];

        } else {

            // pokud přímý spoj neexistuje,
            // nabídneme přestupní spojení

            finalResults = [
                ...transfers
            ];
        }


        // =================================================
        // FINÁLNÍ DUPLICITY
        // =================================================

        finalResults =
            removeDuplicates(
                finalResults
            );


        sortConnections(
            finalResults,
            mode
        );


        // =================================================
        // OMEZENÍ POČTU
        // =================================================

        finalResults =
            finalResults.slice(
                0,
                MAX_RESULTS
            );


        console.log(
            "PŘÍMÉ:",
            direct
        );

        console.log(
            "PŘESTUPNÍ:",
            transfers
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

        findDirectConnections,

        getSegment,

        timeToMinutes,

        minutesToTime
    };

})();
