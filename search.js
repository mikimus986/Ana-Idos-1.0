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
            `data/timetables/${encodeURIComponent(line)}.json`
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

        const parts =
            String(time).split(":");

        if (parts.length !== 2) {
            return NaN;
        }

        const h =
            Number(parts[0]);

        const m =
            Number(parts[1]);

        if (
            !Number.isFinite(h) ||
            !Number.isFinite(m)
        ) {
            return NaN;
        }

        return h * 60 + m;
    }


    // =========================================================
    // MINUTY → ČAS
    // =========================================================

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
    // NORMALIZACE ZASTÁVKY
    // =========================================================

    function normalizeStop(name) {

        return String(name)
            .trim()
            .toLowerCase();
    }


    // =========================================================
    // PARSOVÁNÍ ODJEZDU
    //
    // 41
    // 41S
    //
    // 41S = speciální spoj S
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
                // STANDARDNÍ SPOJ
                // =================================================

                let stopCount =
                    direction.stops.length;

                let destination =
                    direction.destination;


                // =================================================
                // SPOJ S
                //
                // Například:
                //
                // "41S"
                //
                // jede pouze do:
                //
                // Sminov, u lávky
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

                    /*
                     * travelTimes jsou kumulativní minuty
                     * od začátku trasy.
                     *
                     * Například:
                     *
                     * Anské náměstí = 0
                     * IC Ana = 2
                     * Poliklinika Ansko = 4
                     */

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


                if (stops.length === 0) {
                    continue;
                }


                // =================================================
                // ID KONKRÉTNÍHO SPOJE
                //
                // Linka 2 v 7:22 = vždy stejný spoj
                //
                // 1 v 7:22
                // 1S v 7:22
                //
                // jsou rozdílné spoje.
                // =================================================

                const tripId =
                    [
                        String(line),
                        String(hour),
                        String(parsed.minute),
                        parsed.isShortTrip
                            ? "S"
                            : "N",
                        direction.id || destination
                    ].join("-");


                trips.push({

                    id:
                        tripId,

                    line:
                        String(line),

                    destination,

                    isShortTrip:
                        parsed.isShortTrip,

                    directionId:
                        direction.id,

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
            const trips of loaded
        ) {

            results.push(
                ...trips
            );
        }


        return results;
    }


    // =========================================================
    // INDEX ZASTÁVEK
    // =========================================================

    function createStopIndex(
        allTrips
    ) {

        const index =
            new Map();


        for (
            const trip
            of allTrips
        ) {

            for (
                let i = 0;
                i < trip.stops.length;
                i++
            ) {

                const key =
                    normalizeStop(
                        trip.stops[i].name
                    );


                if (!index.has(key)) {

                    index.set(
                        key,
                        []
                    );
                }


                index.get(key).push({

                    trip,

                    index: i

                });
            }
        }


        return index;
    }


    // =========================================================
    // VYTVOŘENÍ ÚSEKU
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

            trip,

            tripId:
                trip.id,

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

            departureMinutes:
                fromStop.minutes,

            arrival:
                toStop.time,

            arrivalMinutes:
                toStop.minutes,

            stops:
                trip.stops.slice(
                    fromIndex,
                    toIndex + 1
                )
        };
    }


    // =========================================================
    // PŘÍMÉ SPOJE
    // =========================================================

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

            const fromIndex =
                trip.stops.findIndex(
                    stop =>
                        normalizeStop(
                            stop.name
                        ) ===
                        normalizeStop(
                            from
                        )
                );


            const toIndex =
                trip.stops.findIndex(
                    stop =>
                        normalizeStop(
                            stop.name
                        ) ===
                        normalizeStop(
                            to
                        )
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


            // =================================================
            // ODJEZDY
            // =================================================

            if (
                mode === "departure"
            ) {

                if (
                    leg.departureMinutes <
                    wantedTime
                ) {
                    continue;
                }

            }


            // =================================================
            // PŘÍJEZDY
            // =================================================

            else {

                if (
                    leg.arrivalMinutes >
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

                destination:
                    trip.destination,

                isShortTrip:
                    trip.isShortTrip,

                tripId:
                    trip.id,

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


        return results;
    }


    // =========================================================
    // PŘESTUPY
    // =========================================================

    function findTransfers(
        allTrips,
        stopIndex,
        from,
        to,
        wantedTime,
        mode
    ) {

        const results = [];


        const startKey =
            normalizeStop(from);

        const targetKey =
            normalizeStop(to);


        const startEntries =
            stopIndex.get(
                startKey
            ) || [];


        const queue = [];


        // =====================================================
        // PRVNÍ ÚSEKY
        // =====================================================

        for (
            const entry
            of startEntries
        ) {

            const trip =
                entry.trip;

            const fromIndex =
                entry.index;


            const departure =
                trip.stops[
                    fromIndex
                ];


            if (
                mode === "departure" &&
                departure.minutes <
                wantedTime
            ) {
                continue;
            }


            // U příjezdového vyhledávání
            // hledáme spoje před požadovaným časem.

            if (
                mode === "arrival" &&
                departure.minutes >
                wantedTime
            ) {
                continue;
            }


            /*
             * Vytvoříme všechny možné první
             * úseky tohoto konkrétního spoje.
             */

            for (
                let i =
                    fromIndex + 1;

                i <
                trip.stops.length;

                i++
            ) {

                const stop =
                    trip.stops[i];


                const leg =
                    makeLeg(
                        trip,
                        fromIndex,
                        i
                    );


                if (!leg) {
                    continue;
                }


                queue.push({

                    legs: [
                        leg
                    ],

                    currentStop:
                        stop.name,

                    currentTime:
                        stop.minutes,

                    usedLines:
                        new Set([
                            trip.line
                        ]),

                    usedTrips:
                        new Set([
                            trip.id
                        ])
                });
            }
        }


        // =====================================================
        // PROHLEDÁVÁNÍ
        // =====================================================

        let bestTransferCount =
            Infinity;


        const visited =
            new Set();


        const MAX_STATES =
            30000;


        let processed =
            0;


        while (
            queue.length > 0 &&
            processed < MAX_STATES
        ) {

            processed++;


            const state =
                queue.shift();


            const transferCount =
                state.legs.length - 1;


            if (
                transferCount >
                bestTransferCount
            ) {
                continue;
            }


            // =================================================
            // CÍL
            // =================================================

            if (
                normalizeStop(
                    state.currentStop
                ) ===
                targetKey
            ) {

                if (
                    state.legs.length >= 2
                ) {

                    const connection =
                        makeTransferConnection(
                            state.legs
                        );


                    if (connection) {

                        if (
                            mode === "departure" ||
                            connection.arrivalMinutes <=
                            wantedTime
                        ) {

                            results.push(
                                connection
                            );


                            bestTransferCount =
                                Math.min(
                                    bestTransferCount,
                                    transferCount
                                );
                        }
                    }
                }


                continue;
            }


            // =================================================
            // OCHRANA PROTI DUPLICITÁM
            // =================================================

            const stateKey =
                [
                    normalizeStop(
                        state.currentStop
                    ),

                    state.currentTime,

                    [...state.usedTrips]
                        .sort()
                        .join(","),

                    state.legs.length
                ].join("|");


            if (
                visited.has(
                    stateKey
                )
            ) {
                continue;
            }


            visited.add(
                stateKey
            );


            // =================================================
            // SPOJE Z PŘESTUPNÍ ZASTÁVKY
            // =================================================

            const entries =
                stopIndex.get(
                    normalizeStop(
                        state.currentStop
                    )
                ) || [];


            for (
                const entry
                of entries
            ) {

                const nextTrip =
                    entry.trip;


                // =================================================
                // STEJNÝ KONKRÉTNÍ SPOJ
                //
                // Například:
                //
                // linka 2 - 7:22
                //
                // se nikdy nepoužije znovu.
                // =================================================

                if (
                    state.usedTrips.has(
                        nextTrip.id
                    )
                ) {
                    continue;
                }


                // =================================================
                // STEJNÁ LINKA
                // =================================================

                if (
                    state.usedLines.has(
                        nextTrip.line
                    )
                ) {
                    continue;
                }


                const transferIndex =
                    entry.index;


                const departure =
                    nextTrip.stops[
                        transferIndex
                    ];


                // =================================================
                // MUSÍME STIHNOUT PŘESTUP
                // =================================================

                if (
                    departure.minutes <
                    state.currentTime
                ) {
                    continue;
                }


                // =================================================
                // OCHRANA PROTI PŘÍLIŠ MNOHA PŘESTUPŮ
                // =================================================

                if (
                    state.legs.length >=
                    bestTransferCount + 1
                ) {
                    continue;
                }


                // =================================================
                // DALŠÍ ÚSEKY
                // =================================================

                for (
                    let i =
                        transferIndex + 1;

                    i <
                    nextTrip.stops.length;

                    i++
                ) {

                    const nextStop =
                        nextTrip.stops[i];


                    const nextLeg =
                        makeLeg(
                            nextTrip,
                            transferIndex,
                            i
                        );


                    if (!nextLeg) {
                        continue;
                    }


                    queue.push({

                        legs: [
                            ...state.legs,
                            nextLeg
                        ],

                        currentStop:
                            nextStop.name,

                        currentTime:
                            nextStop.minutes,

                        usedLines:
                            new Set([
                                ...state.usedLines,
                                nextTrip.line
                            ]),

                        usedTrips:
                            new Set([
                                ...state.usedTrips,
                                nextTrip.id
                            ])
                    });
                }
            }
        }


        return results;
    }


    // =========================================================
    // VYTVOŘENÍ PŘESTUPNÍHO SPOJE
    // =========================================================

    function makeTransferConnection(
        legs
    ) {

        if (
            !Array.isArray(legs) ||
            legs.length < 2
        ) {
            return null;
        }


        const first =
            legs[0];

        const last =
            legs[
                legs.length - 1
            ];


        return {

            type:
                "transfer",

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
                last.arrivalMinutes,

            legs:
                legs.map(
                    leg => ({

                        line:
                            leg.line,

                        tripId:
                            leg.tripId,

                        destination:
                            leg.destination,

                        isShortTrip:
                            leg.isShortTrip,

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
                    })
                ),

            // První místo přestupu
            transferStop:
                legs[0].to
        };
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


            // =================================================
            // PŘÍMÝ SPOJ
            //
            // Jeden konkrétní spoj = jedna nabídka.
            //
            // Například:
            //
            // 2 / 07:22
            //
            // se zobrazí pouze jednou.
            // =================================================

            if (
                connection.type ===
                "direct"
            ) {

                key =
                    [
                        "D",
                        connection.tripId,
                        connection.line,
                        connection.departure
                    ].join("|");

            }


            // =================================================
            // PŘESTUP
            // =================================================

            else {

                key =
                    [
                        "T",

                        connection.legs
                            .map(
                                leg =>
                                    leg.tripId
                            )
                            .join(">"),

                        connection.transferStop
                    ].join("|");
            }


            const old =
                map.get(key);


            if (
                !old ||
                connection.arrivalMinutes <
                old.arrivalMinutes
            ) {

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
    // ODSTRANĚNÍ PŘESTUPŮ, KTERÉ JSOU STEJNĚ DOBRÉ
    // =========================================================

    function removeWorseTransfers(
        transfers
    ) {

        const map =
            new Map();


        for (
            const connection
            of transfers
        ) {

            const key =
                connection.legs
                    .map(
                        leg =>
                            `${leg.line}@${leg.departure}`
                    )
                    .join(">");


            const old =
                map.get(key);


            if (
                !old ||
                connection.arrivalMinutes <
                old.arrivalMinutes
            ) {

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
        afterTime,
        dayType,
        lineNumbers,
        mode = "departure"
    ) {

        if (
            !from ||
            !to
        ) {
            return [];
        }


        const wantedTime =
            timeToMinutes(
                afterTime
            );


        if (
            !Number.isFinite(
                wantedTime
            )
        ) {
            return [];
        }


        // =====================================================
        // NAČTENÍ VŠECH SPOJŮ
        // =====================================================

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


        // =====================================================
        // INDEX
        // =====================================================

        const stopIndex =
            createStopIndex(
                allTrips
            );


        // =====================================================
        // PŘÍMÉ
        // =====================================================

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


        // =====================================================
        // PŘESTUPY
        // =====================================================

        let transfers =
            findTransfers(
                allTrips,
                stopIndex,
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
            removeWorseTransfers(
                transfers
            );


        // =====================================================
        // SEŘAZENÍ PŘÍMÝCH
        // =====================================================

        direct.sort(
            (a, b) => {

                if (
                    mode ===
                    "departure"
                ) {

                    return (
                        a.departureMinutes -
                        b.departureMinutes
                    );
                }


                return (
                    b.departureMinutes -
                    a.departureMinutes
                );
            }
        );


        // =====================================================
        // SEŘAZENÍ PŘESTUPŮ
        // =====================================================

        transfers.sort(
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


        // =====================================================
        // PŘÍMÉ SPOJE EXISTUJÍ
        //
        // PŘESTUPY JEN POKUD JSOU RYCHLEJŠÍ
        // =====================================================

        if (
            direct.length > 0
        ) {

            const fastestDirect =
                direct[0];


            const fasterTransfers =
                transfers.filter(
                    connection =>
                        connection.arrivalMinutes <
                        fastestDirect.arrivalMinutes
                );


            // -----------------------------------------------
            // ŽÁDNÝ PŘESTUP NENÍ RYCHLEJŠÍ
            // -----------------------------------------------

            if (
                fasterTransfers.length === 0
            ) {

                return direct.slice(
                    0,
                    30
                );
            }


            // -----------------------------------------------
            // PŘESTUP JE RYCHLEJŠÍ
            //
            // Ukážeme přímé spoje + skutečně rychlejší
            // přestupy.
            // -----------------------------------------------

            return [
                ...direct.slice(
                    0,
                    30
                ),

                ...fasterTransfers.slice(
                    0,
                    10
                )
            ].sort(
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


        // =====================================================
        // ŽÁDNÝ PŘÍMÝ SPOJ
        //
        // POTOM NABÍDNEME PŘESTUPY
        // =====================================================

        return transfers.slice(
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
