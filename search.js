// ============================================================
// search.js
// Vyhledávání přímých spojů + přestupů
// ============================================================

window.searchTimetable = (() => {

    const cache = new Map();


    // ============================================================
    // POMOCNÉ FUNKCE
    // ============================================================

    function normalizeText(value) {

        return String(value ?? "")
            .trim()
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "");
    }


    function stopName(stop) {

        if (typeof stop === "string") {
            return stop.trim();
        }

        if (!stop) {
            return "";
        }

        return String(
            stop.name ??
            stop.stop ??
            stop.station ??
            ""
        ).trim();
    }


    function stopMinutes(stop) {

        if (typeof stop === "string") {
            return 0;
        }

        if (!stop) {
            return 0;
        }

        const value =
            stop.minutes ??
            stop.minute ??
            stop.time ??
            stop.duration ??
            stop.travelTime ??
            0;

        const number =
            Number(value);

        return Number.isFinite(number)
            ? number
            : 0;
    }


    function timeToMinutes(time) {

        if (!time) {
            return null;
        }

        const text =
            String(time).trim();

        const parts =
            text.split(":");

        if (parts.length !== 2) {
            return null;
        }

        const hours =
            Number(parts[0]);

        const minutes =
            Number(parts[1]);

        if (
            !Number.isFinite(hours) ||
            !Number.isFinite(minutes)
        ) {
            return null;
        }

        return (
            hours * 60 +
            minutes
        );
    }


    function minutesToTime(total) {

        total =
            ((total % 1440) + 1440) % 1440;

        const hours =
            Math.floor(total / 60);

        const minutes =
            total % 60;

        return (
            String(hours).padStart(2, "0") +
            ":" +
            String(minutes).padStart(2, "0")
        );
    }


    function addMinutes(time, minutes) {

        const base =
            timeToMinutes(time);

        if (base === null) {
            return null;
        }

        return minutesToTime(
            base + Number(minutes || 0)
        );
    }


    function getDayNames(dayType) {

        if (
            dayType === "weekends"
        ) {
            return [
                "weekends",
                "weekend",
                "saturday",
                "sunday",
                "so",
                "ne"
            ];
        }

        return [
            "weekdays",
            "weekday",
            "workdays",
            "workingdays",
            "monday",
            "tuesday",
            "wednesday",
            "thursday",
            "friday",
            "po",
            "ut",
            "st",
            "ct",
            "pa"
        ];
    }


    // ============================================================
    // NAČTENÍ JÍZDNÍHO ŘÁDU
    // ============================================================

    async function loadTimetable(line) {

        line =
            String(line).trim();


        if (cache.has(line)) {
            return cache.get(line);
        }


        const promise =
            fetch(
                `data/timetables/${encodeURIComponent(line)}.json`
            )
            .then(response => {

                if (!response.ok) {

                    throw new Error(
                        `Jízdní řád linky ${line}: HTTP ${response.status}`
                    );
                }

                return response.json();
            })
            .then(data => {

                cache.set(
                    line,
                    data
                );

                return data;
            });


        cache.set(
            line,
            promise
        );


        return promise;
    }


    // ============================================================
    // ZÍSKÁNÍ SMĚRŮ
    // ============================================================

    function getDirections(data) {

        if (!data) {
            return [];
        }


        if (
            Array.isArray(data.directions)
        ) {
            return data.directions;
        }


        if (
            Array.isArray(data.routes)
        ) {
            return data.routes;
        }


        if (
            Array.isArray(data)
        ) {
            return data;
        }


        return [];
    }


    // ============================================================
    // ZÍSKÁNÍ ZASTÁVEK SMĚRU
    // ============================================================

    function getStops(direction) {

        if (!direction) {
            return [];
        }


        if (
            Array.isArray(direction.stops)
        ) {
            return direction.stops;
        }


        if (
            Array.isArray(direction.stations)
        ) {
            return direction.stations;
        }


        return [];
    }


    // ============================================================
    // ZÍSKÁNÍ JÍZDNÍCH ČASŮ
    // ============================================================

    function getTimesObject(
        direction,
        data,
        dayType
    ) {

        const dayNames =
            getDayNames(dayType);


        const sources = [
            direction?.times,
            direction?.departures,
            direction?.timetable,
            data?.times,
            data?.departures,
            data?.timetable
        ];


        for (
            const source
            of sources
        ) {

            if (!source) {
                continue;
            }


            if (Array.isArray(source)) {
                return source;
            }


            if (
                typeof source === "object"
            ) {

                for (
                    const name
                    of dayNames
                ) {

                    if (
                        Array.isArray(
                            source[name]
                        )
                    ) {
                        return source[name];
                    }
                }
            }
        }


        return [];
    }


    // ============================================================
    // ZÍSKÁNÍ SPOJŮ
    // ============================================================

    function getTrips(
        direction,
        data,
        dayType
    ) {

        // --------------------------------------------------------
        // 1. trips
        // --------------------------------------------------------

        if (
            Array.isArray(direction?.trips)
        ) {

            return direction.trips;
        }


        // --------------------------------------------------------
        // 2. departures jako pole objektů
        // --------------------------------------------------------

        if (
            Array.isArray(direction?.departures) &&
            direction.departures.some(
                item =>
                    typeof item === "object"
            )
        ) {

            return direction.departures;
        }


        // --------------------------------------------------------
        // 3. times
        // --------------------------------------------------------

        const times =
            getTimesObject(
                direction,
                data,
                dayType
            );


        if (
            Array.isArray(times)
        ) {

            return times.map(
                time => ({
                    departure:
                        typeof time === "string"
                            ? time
                            : time?.departure ??
                              time?.time
                })
            );
        }


        return [];
    }


    // ============================================================
    // ZDA JE SPOJ "S"
    // ============================================================

    function isShortTrip(
        trip,
        direction,
        data
    ) {

        return Boolean(
            trip?.isShortTrip === true ||
            trip?.short === true ||
            trip?.variant === "S" ||
            trip?.type === "S" ||
            direction?.isShortTrip === true ||
            direction?.short === true ||
            direction?.variant === "S" ||
            data?.isShortTrip === true
        );
    }


    // ============================================================
    // VÝCHOZÍ ČAS SPOJE
    // ============================================================

    function getDepartureTime(trip) {

        if (
            typeof trip === "string"
        ) {
            return trip;
        }


        if (!trip) {
            return null;
        }


        return (
            trip.departure ??
            trip.time ??
            trip.start ??
            trip.fromTime ??
            null
        );
    }


    // ============================================================
    // VYTVOŘENÍ ZASTÁVEK S ČASY
    //
    // Příklad:
    //
    // Anské náměstí = 0
    // IC Ana = 2
    // Poliklinika Ansko = 4
    //
    // Odjezd 15:21:
    //
    // Anské náměstí     15:21
    // IC Ana            15:23
    // Poliklinika Ansko 15:25
    // ============================================================

    function buildStops(
        direction,
        departure
    ) {

        const sourceStops =
            getStops(direction);


        const result = [];


        if (
            !sourceStops.length
        ) {
            return result;
        }


        let accumulatedMinutes = 0;


        for (
            let i = 0;
            i < sourceStops.length;
            i++
        ) {

            const raw =
                sourceStops[i];


            const name =
                stopName(raw);


            if (!name) {
                continue;
            }


            /*
             * První zastávka má vždy
             * čas odjezdu.
             *
             * U dalších zastávek je hodnota
             * v JSONu počet minut od výchozí
             * zastávky.
             */

            if (i === 0) {

                accumulatedMinutes =
                    0;

            } else {

                accumulatedMinutes =
                    stopMinutes(raw);
            }


            const time =
                addMinutes(
                    departure,
                    accumulatedMinutes
                );


            result.push({
                name,
                time,
                minutes:
                    accumulatedMinutes
            });
        }


        return result;
    }


    // ============================================================
    // DESTINACE
    // ============================================================

    function getDestination(
        direction,
        stops
    ) {

        if (
            direction?.destination
        ) {
            return String(
                direction.destination
            );
        }


        if (
            direction?.to
        ) {
            return String(
                direction.to
            );
        }


        if (stops.length) {

            return stops[
                stops.length - 1
            ].name;
        }


        return "";
    }


    // ============================================================
    // NAJDI INDEX ZASTÁVKY
    // ============================================================

    function findStopIndex(
        stops,
        wanted
    ) {

        const target =
            normalizeText(wanted);


        return stops.findIndex(
            stop =>
                normalizeText(
                    stop.name
                ) === target
        );
    }


    // ============================================================
    // VYTVOŘÍ JEDEN SPOJ
    // ============================================================

    function createTripConnection(
        line,
        direction,
        trip,
        tripIndex,
        data
    ) {

        const departure =
            getDepartureTime(trip);


        if (!departure) {
            return null;
        }


        if (
            timeToMinutes(departure) === null
        ) {
            return null;
        }


        const stops =
            buildStops(
                direction,
                departure
            );


        if (
            stops.length === 0
        ) {
            return null;
        }


        const destination =
            getDestination(
                direction,
                stops
            );


        return {

            type: "direct",

            line:
                String(line),

            direction:
                direction?.name ??
                direction?.direction ??
                destination,

            destination,

            departure,

            arrival:
                stops[stops.length - 1].time,

            from:
                stops[0].name,

            to:
                stops[stops.length - 1].name,

            stops,

            tripIndex,

            isShortTrip:
                isShortTrip(
                    trip,
                    direction,
                    data
                )
        };
    }


    // ============================================================
    // VŠECHNY SPOJE JEDNÉ LINKY
    // ============================================================

    async function getLineTrips(
        line,
        dayType
    ) {

        const data =
            await loadTimetable(line);


        const directions =
            getDirections(data);


        const connections = [];


        for (
            const direction
            of directions
        ) {

            const trips =
                getTrips(
                    direction,
                    data,
                    dayType
                );


            for (
                let i = 0;
                i < trips.length;
                i++
            ) {

                const connection =
                    createTripConnection(
                        line,
                        direction,
                        trips[i],
                        i,
                        data
                    );


                if (connection) {

                    connections.push(
                        connection
                    );
                }
            }
        }


        return connections;
    }


    // ============================================================
    // VŠECHNY SPOJE VŠECH LINEK
    // ============================================================

    async function getAllTrips(
        lineNumbers,
        dayType
    ) {

        const all = [];


        for (
            const line
            of lineNumbers
        ) {

            try {

                const trips =
                    await getLineTrips(
                        line,
                        dayType
                    );


                all.push(
                    ...trips
                );

            } catch (error) {

                console.warn(
                    `Linka ${line} se nepodařila načíst:`,
                    error
                );
            }
        }


        return all;
    }


    // ============================================================
    // PŘÍMÉ SPOJENÍ
    // ============================================================

    function findDirectConnections(
        allTrips,
        from,
        to,
        afterTime
    ) {

        const fromName =
            normalizeText(from);

        const toName =
            normalizeText(to);

        const wantedTime =
            timeToMinutes(
                afterTime
            );


        const results = [];


        for (
            const trip
            of allTrips
        ) {

            const fromIndex =
                findStopIndex(
                    trip.stops,
                    from
                );


            const toIndex =
                findStopIndex(
                    trip.stops,
                    to
                );


            /*
             * Směr musí být správný.
             */

            if (
                fromIndex === -1 ||
                toIndex === -1 ||
                fromIndex >= toIndex
            ) {
                continue;
            }


            const departure =
                trip.stops[
                    fromIndex
                ].time;


            const arrival =
                trip.stops[
                    toIndex
                ].time;


            const departureMinutes =
                timeToMinutes(
                    departure
                );


            if (
                departureMinutes === null
            ) {
                continue;
            }


            if (
                wantedTime !== null &&
                departureMinutes < wantedTime
            ) {
                continue;
            }


            /*
             * Zkrátíme zastávky pouze na
             * vyhledaný úsek.
             */

            const segment =
                trip.stops.slice(
                    fromIndex,
                    toIndex + 1
                );


            results.push({

                ...trip,

                type: "direct",

                from:
                    trip.stops[
                        fromIndex
                    ].name,

                to:
                    trip.stops[
                        toIndex
                    ].name,

                departure,

                arrival,

                stops:
                    segment,

                duration:
                    timeToMinutes(arrival) -
                    timeToMinutes(departure),

                originalFromIndex:
                    fromIndex,

                originalToIndex:
                    toIndex,

                _fromName:
                    fromName,

                _toName:
                    toName
            });
        }


        return results;
    }


    // ============================================================
    // PRVNÍ SPOLEČNÁ ZASTÁVKA
    //
    // DŮLEŽITÉ:
    // hledáme společnou zastávku pouze v úsecích,
    // které skutečně potřebujeme.
    // ============================================================

    function findFirstTransferStop(
        firstTrip,
        secondTrip,
        firstFromIndex,
        secondToIndex
    ) {

        const firstStops =
            firstTrip.stops;

        const secondStops =
            secondTrip.stops;


        /*
         * Druhá linka musí jet ze společné zastávky
         * směrem k cíli.
         */

        for (
            let i = firstFromIndex + 1;
            i < firstStops.length;
            i++
        ) {

            const firstName =
                normalizeText(
                    firstStops[i].name
                );


            const secondIndex =
                secondStops.findIndex(
                    (stop, index) =>
                        index < secondToIndex &&
                        normalizeText(
                            stop.name
                        ) === firstName
                );


            if (
                secondIndex === -1
            ) {
                continue;
            }


            return {

                name:
                    firstStops[i].name,

                firstIndex:
                    i,

                secondIndex
            };
        }


        return null;
    }


    // ============================================================
    // PŘESTUP
    // ============================================================

    function createTransfer(
        firstTrip,
        secondTrip,
        from,
        to,
        afterTime
    ) {

        /*
         * První linka:
         *
         * FROM → přestup
         */

        const firstFromIndex =
            findStopIndex(
                firstTrip.stops,
                from
            );


        if (
            firstFromIndex === -1
        ) {
            return null;
        }


        /*
         * Druhá linka:
         *
         * přestup → TO
         */

        const secondToIndex =
            findStopIndex(
                secondTrip.stops,
                to
            );


        if (
            secondToIndex === -1
        ) {
            return null;
        }


        /*
         * Najdeme první společnou zastávku.
         */

        const transfer =
            findFirstTransferStop(
                firstTrip,
                secondTrip,
                firstFromIndex,
                secondToIndex
            );


        if (!transfer) {
            return null;
        }


        const transferArrival =
            firstTrip.stops[
                transfer.firstIndex
            ].time;


        const secondDeparture =
            secondTrip.stops[
                transfer.secondIndex
            ].time;


        const arrivalMinutes =
            timeToMinutes(
                transferArrival
            );


        const departureMinutes =
            timeToMinutes(
                secondDeparture
            );


        if (
            arrivalMinutes === null ||
            departureMinutes === null
        ) {
            return null;
        }


        /*
         * Musí být možné přestoupit.
         *
         * Necháváme minimálně 1 minutu.
         */

        if (
            departureMinutes <=
            arrivalMinutes
        ) {
            return null;
        }


        /*
         * Nechceme absurdně dlouhé čekání.
         */

        const waiting =
            departureMinutes -
            arrivalMinutes;


        if (
            waiting > 30
        ) {
            return null;
        }


        const firstStops =
            firstTrip.stops.slice(
                firstFromIndex,
                transfer.firstIndex + 1
            );


        const secondStops =
            secondTrip.stops.slice(
                transfer.secondIndex,
                secondToIndex + 1
            );


        const firstDeparture =
            firstStops[0].time;


        const finalArrival =
            secondStops[
                secondStops.length - 1
            ].time;


        const totalDuration =
            timeToMinutes(
                finalArrival
            ) -
            timeToMinutes(
                firstDeparture
            );


        return {

            type: "transfer",

            from:
                firstStops[0].name,

            to:
                secondStops[
                    secondStops.length - 1
                ].name,

            departure:
                firstDeparture,

            arrival:
                finalArrival,

            duration:
                totalDuration,

            transferStop:
                transfer.name,

            legs: [

                {

                    ...firstTrip,

                    from:
                        firstStops[0].name,

                    to:
                        transfer.name,

                    departure:
                        firstDeparture,

                    arrival:
                        transferArrival,

                    stops:
                        firstStops
                },

                {

                    ...secondTrip,

                    from:
                        transfer.name,

                    to:
                        secondStops[
                            secondStops.length - 1
                        ].name,

                    departure:
                        secondDeparture,

                    arrival:
                        finalArrival,

                    stops:
                        secondStops
                }

            ]
        };
    }


    // ============================================================
    // ODSTRANĚNÍ DUPLIKÁTŮ PŘÍMÝCH SPOJŮ
    //
    // Jeden konkrétní spoj se zobrazí jen jednou.
    // ============================================================

    function removeDuplicateDirects(
        connections
    ) {

        const map =
            new Map();


        for (
            const connection
            of connections
        ) {

            const key = [
                connection.line,
                connection.departure,
                connection.arrival,
                connection.from,
                connection.to,
                connection.isShortTrip
                    ? "S"
                    : ""
            ].join("|");


            if (
                !map.has(key)
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


    // ============================================================
    // ODSTRANĚNÍ DUPLIKÁTŮ PŘESTUPŮ
    //
    // Například:
    //
    // 2 06:44 → 1 06:52 přes Hlavní nádraží
    //
    // se zobrazí jen jednou.
    // ============================================================

    function removeDuplicateTransfers(
        connections
    ) {

        const map =
            new Map();


        for (
            const connection
            of connections
        ) {

            if (
                !connection.legs ||
                connection.legs.length < 2
            ) {
                continue;
            }


            const first =
                connection.legs[0];

            const second =
                connection.legs[1];


            const key = [
                first.line,
                first.departure,
                first.arrival,
                second.line,
                second.departure,
                second.arrival,
                connection.transferStop
            ].join("|");


            if (
                !map.has(key)
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


    // ============================================================
    // NAJLEPŠÍ PŘESTUPY
    // ============================================================

    function findTransfers(
        allTrips,
        from,
        to,
        afterTime
    ) {

        const results = [];


        const firstLegs =
            allTrips.filter(
                trip =>
                    findStopIndex(
                        trip.stops,
                        from
                    ) !== -1
            );


        const secondLegs =
            allTrips.filter(
                trip =>
                    findStopIndex(
                        trip.stops,
                        to
                    ) !== -1
            );


        for (
            const firstTrip
            of firstLegs
        ) {

            const firstFromIndex =
                findStopIndex(
                    firstTrip.stops,
                    from
                );


            if (
                firstFromIndex === -1
            ) {
                continue;
            }


            const firstDeparture =
                firstTrip.stops[
                    firstFromIndex
                ].time;


            const firstDepartureMinutes =
                timeToMinutes(
                    firstDeparture
                );


            const requestedMinutes =
                timeToMinutes(
                    afterTime
                );


            if (
                requestedMinutes !== null &&
                firstDepartureMinutes <
                requestedMinutes
            ) {
                continue;
            }


            for (
                const secondTrip
                of secondLegs
            ) {

                /*
                 * Nesmí to být stejná linka.
                 */

                if (
                    String(firstTrip.line) ===
                    String(secondTrip.line)
                ) {
                    continue;
                }


                /*
                 * Najdeme přestup.
                 */

                const transfer =
                    createTransfer(
                        firstTrip,
                        secondTrip,
                        from,
                        to,
                        afterTime
                    );


                if (!transfer) {
                    continue;
                }


                results.push(
                    transfer
                );
            }
        }


        return removeDuplicateTransfers(
            results
        );
    }


    // ============================================================
    // VÝBĚR NEJLEPŠÍCH PŘESTUPŮ
    //
    // Pokud existuje přímý spoj,
    // přestup se použije pouze pokud je rychlejší.
    // ============================================================

    function selectUsefulConnections(
        direct,
        transfers
    ) {

        /*
         * Nejprve odstraníme duplicitní přímé spoje.
         */

        direct =
            removeDuplicateDirects(
                direct
            );


        transfers =
            removeDuplicateTransfers(
                transfers
            );


        /*
         * Když není žádný přímý spoj,
         * můžeme nabídnout přestupy.
         */

        if (
            direct.length === 0
        ) {

            return transfers;
        }


        /*
         * Pro každý odjezd přímého spoje
         * zjistíme jeho dobu jízdy.
         */

        const directDurations =
            direct.map(
                connection =>
                    connection.duration
            );


        const fastestDirect =
            Math.min(
                ...directDurations
            );


        /*
         * Přestupy necháme pouze tehdy,
         * pokud jsou rychlejší než nejrychlejší
         * přímé spojení.
         */

        const usefulTransfers =
            transfers.filter(
                transfer =>
                    transfer.duration <
                    fastestDirect
            );


        return [
            ...direct,
            ...usefulTransfers
        ];
    }


    // ============================================================
    // SEŘAZENÍ
    // ============================================================

    function sortConnections(
        connections
    ) {

        return connections.sort(
            (a, b) => {

                const aTime =
                    timeToMinutes(
                        a.departure
                    );

                const bTime =
                    timeToMinutes(
                        b.departure
                    );


                if (
                    aTime !== bTime
                ) {
                    return aTime - bTime;
                }


                /*
                 * Při stejném odjezdu
                 * má přednost přímý spoj.
                 */

                if (
                    a.type !== b.type
                ) {

                    return a.type === "direct"
                        ? -1
                        : 1;
                }


                return (
                    (a.duration || 0) -
                    (b.duration || 0)
                );
            }
        );
    }


    // ============================================================
    // HLAVNÍ VYHLEDÁVÁNÍ
    // ============================================================

    async function findConnections(
        from,
        to,
        afterTime = "00:00",
        dayType = "weekdays",
        lineNumbers = [],
        mode = "departure"
    ) {

        from =
            String(from ?? "").trim();

        to =
            String(to ?? "").trim();


        if (
            !from ||
            !to
        ) {
            return [];
        }


        if (
            from.toLowerCase() ===
            to.toLowerCase()
        ) {
            return [];
        }


        /*
         * Když app.js neposlal linky,
         * použijeme linky z routes.json.
         *
         * V současné aplikaci ale app.js
         * linky předává.
         */

        if (
            !Array.isArray(lineNumbers) ||
            lineNumbers.length === 0
        ) {

            return [];
        }


        // ========================================================
        // NAČTENÍ VŠECH LINEK
        // ========================================================

        const allTrips =
            await getAllTrips(
                lineNumbers,
                dayType
            );


        if (
            allTrips.length === 0
        ) {
            return [];
        }


        // ========================================================
        // ODJEZDY
        // ========================================================

        let searchTime =
            afterTime || "00:00";


        /*
         * Režim "arrival":
         *
         * app.js stále pracuje s časem jako
         * výchozím bodem vyhledávání.
         *
         * Zde proto zatím hledáme spoje,
         * které přijedou od zadaného času.
         *
         * Výsledky se následně filtrují podle
         * příjezdu.
         */

        if (
            mode === "arrival"
        ) {

            const directArrival =
                [];


            for (
                const trip
                of allTrips
            ) {

                const fromIndex =
                    findStopIndex(
                        trip.stops,
                        from
                    );


                const toIndex =
                    findStopIndex(
                        trip.stops,
                        to
                    );


                if (
                    fromIndex === -1 ||
                    toIndex === -1 ||
                    fromIndex >= toIndex
                ) {
                    continue;
                }


                const arrival =
                    trip.stops[
                        toIndex
                    ].time;


                const arrivalMinutes =
                    timeToMinutes(
                        arrival
                    );


                const requested =
                    timeToMinutes(
                        searchTime
                    );


                if (
                    requested !== null &&
                    arrivalMinutes < requested
                ) {
                    continue;
                }


                const segment =
                    trip.stops.slice(
                        fromIndex,
                        toIndex + 1
                    );


                directArrival.push({

                    ...trip,

                    type: "direct",

                    from:
                        trip.stops[
                            fromIndex
                        ].name,

                    to:
                        trip.stops[
                            toIndex
                        ].name,

                    departure:
                        trip.stops[
                            fromIndex
                        ].time,

                    arrival,

                    stops:
                        segment,

                    duration:
                        arrivalMinutes -
                        timeToMinutes(
                            trip.stops[
                                fromIndex
                            ].time
                        )
                });
            }


            /*
             * V režimu příjezdy vrátíme
             * přímé spoje podle příjezdu.
             */

            return removeDuplicateDirects(
                directArrival
            ).sort(
                (a, b) =>
                    timeToMinutes(a.arrival) -
                    timeToMinutes(b.arrival)
            );
        }


        // ========================================================
        // PŘÍMÉ
        // ========================================================

        const direct =
            findDirectConnections(
                allTrips,
                from,
                to,
                searchTime
            );


        // ========================================================
        // PŘESTUPY
        // ========================================================

        const transfers =
            findTransfers(
                allTrips,
                from,
                to,
                searchTime
            );


        // ========================================================
        // VÝBĚR
        // ========================================================

        let result =
            selectUsefulConnections(
                direct,
                transfers
            );


        // ========================================================
        // ODSTRANĚNÍ STEJNÉHO SPOJE
        // ========================================================

        const finalMap =
            new Map();


        for (
            const connection
            of result
        ) {

            let key;


            if (
                connection.type ===
                "transfer"
            ) {

                const first =
                    connection.legs[0];

                const second =
                    connection.legs[1];


                key = [
                    "T",
                    first.line,
                    first.departure,
                    connection.transferStop,
                    second.line,
                    second.departure,
                    second.arrival
                ].join("|");

            } else {

                key = [
                    "D",
                    connection.line,
                    connection.departure,
                    connection.arrival,
                    connection.from,
                    connection.to
                ].join("|");
            }


            if (
                !finalMap.has(key)
            ) {

                finalMap.set(
                    key,
                    connection
                );
            }
        }


        result =
            [
                ...finalMap.values()
            ];


        // ========================================================
        // ŘAZENÍ
        // ========================================================

        return sortConnections(
            result
        );
    }


    // ============================================================
    // VEŘEJNÉ FUNKCE
    // ============================================================

    return {

        loadTimetable,

        findConnections,

        getLineTrips,

        getAllTrips

    };

})();
