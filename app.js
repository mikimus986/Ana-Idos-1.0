// app.js

document.addEventListener("DOMContentLoaded", async () => {

    const fromInput = document.getElementById("from");
    const toInput = document.getElementById("to");
    const dateInput = document.getElementById("date");
    const timeInput = document.getElementById("time");
    const searchButton = document.getElementById("searchButton");
    const swapButton = document.getElementById("swapButton");
    const resultsContainer = document.getElementById("results");
    const stopsList = document.getElementById("stops");


    // ==================================================
    // KONTROLA HTML
    // ==================================================

    if (
        !fromInput ||
        !toInput ||
        !searchButton ||
        !resultsContainer
    ) {
        console.error("Chybí některý HTML prvek.");
        return;
    }


    if (!window.searchTimetable) {
        console.error("search.js nebyl načten.");
        return;
    }


    // ==================================================
    // ROUTES.JSON
    // ==================================================

    let routes = [];

    try {

        const response =
            await fetch("data/routes.json");

        if (!response.ok) {
            throw new Error(
                `routes.json: HTTP ${response.status}`
            );
        }

        routes = await response.json();

        console.log("Načtené linky:", routes);

    } catch (error) {

        console.error(
            "Nepodařilo se načíst routes.json:",
            error
        );

        resultsContainer.innerHTML = `
            <div class="resultCard">
                <strong>Chyba:</strong>
                nepodařilo se načíst routes.json.
            </div>
        `;

        return;
    }


    // ==================================================
    // INFORMACE O LINCE
    // ==================================================

    function getRouteInfo(line) {

        const found =
            routes.find(
                route =>
                    String(route.line).trim() ===
                    String(line).trim()
            );


        if (found) {
            return found;
        }


        return {
            line: String(line),
            icon: "🚌",
            color: "#2196F3",
            type: "bus"
        };
    }


    // ==================================================
    // VŠECHNY ZASTÁVKY
    // ==================================================

    async function loadAllStops() {

        if (!stopsList) {
            return;
        }


        const allStops =
            new Set();


        for (
            const route
            of routes
        ) {

            try {

                const timetable =
                    await window.searchTimetable
                        .loadTimetable(
                            route.line
                        );


                for (
                    const direction
                    of timetable.directions || []
                ) {

                    for (
                        const stop
                        of direction.stops || []
                    ) {

                        allStops.add(stop);
                    }
                }

            } catch (error) {

                console.warn(
                    `Nelze načíst linku ${route.line}:`,
                    error
                );
            }
        }


        stopsList.innerHTML = "";


        const sortedStops =
            [...allStops].sort(
                (a, b) =>
                    a.localeCompare(b, "cs")
            );


        for (
            const stop
            of sortedStops
        ) {

            const option =
                document.createElement("option");

            option.value =
                stop;

            stopsList.appendChild(option);
        }
    }


    await loadAllStops();


    // ==================================================
    // PROHOZENÍ
    // ==================================================

    if (swapButton) {

        swapButton.addEventListener(
            "click",
            () => {

                const oldFrom =
                    fromInput.value;

                fromInput.value =
                    toInput.value;

                toInput.value =
                    oldFrom;
            }
        );
    }


    // ==================================================
    // VÝCHOZÍ DATUM
    // ==================================================

    if (
        dateInput &&
        !dateInput.value
    ) {

        const today =
            new Date();


        const year =
            today.getFullYear();

        const month =
            String(
                today.getMonth() + 1
            ).padStart(2, "0");

        const day =
            String(
                today.getDate()
            ).padStart(2, "0");


        dateInput.value =
            `${year}-${month}-${day}`;
    }


    // ==================================================
    // TYP DNE
    // ==================================================

    function getDayType() {

        let date;


        if (
            dateInput &&
            dateInput.value
        ) {

            date =
                new Date(
                    dateInput.value +
                    "T12:00:00"
                );

        } else {

            date =
                new Date();
        }


        const day =
            date.getDay();


        if (
            day === 0 ||
            day === 6
        ) {

            return "weekends";
        }


        return "weekdays";
    }


    // ==================================================
    // VYTVOŘENÍ HLAVIČKY LINKY
    // ==================================================

    function createLineHeader(
        line,
        destination
    ) {

        const route =
            getRouteInfo(line);


        const header =
            document.createElement("div");


        header.className =
            "resultHeader";


        header.style.backgroundColor =
            route.color;


        header.style.color =
            "white";


        header.innerHTML = `

            <span class="routeIcon">
                ${route.icon}
            </span>

            <strong class="routeNumber">
                ${route.line}
            </strong>

            <span class="routeDirection">
                Směr: ${destination}
            </span>

        `;


        return header;
    }


    // ==================================================
    // ZASTÁVKY
    // ==================================================

    function createStopsBox(
        stops,
        line
    ) {

        const box =
            document.createElement("div");


        box.className =
            "resultStops";


        const route =
            getRouteInfo(line);


        for (
            const stop
            of stops
        ) {

            const row =
                document.createElement("div");


            row.className =
                "stopRow";


            const dot =
                document.createElement("span");


            dot.className =
                "stopDot";


            dot.style.backgroundColor =
                route.color;


            const name =
                document.createElement("span");


            name.className =
                "stopName";


            name.textContent =
                stop.name;


            const time =
                document.createElement("span");


            time.className =
                "stopTime";


            time.textContent =
                stop.time;


            row.appendChild(dot);
            row.appendChild(name);
            row.appendChild(time);


            box.appendChild(row);
        }


        return box;
    }


    // ==================================================
    // ČASY OD → DO
    // ==================================================

    function createMainTimes(
        connection
    ) {

        const main =
            document.createElement("div");


        main.className =
            "resultMain";


        main.innerHTML = `

            <div class="mainStop">

                <div class="mainTime">
                    ${connection.departure}
                </div>

                <div class="mainStopName">
                    ${connection.from}
                </div>

            </div>

            <div class="routeArrow">
                →
            </div>

            <div class="mainStop">

                <div class="mainTime">
                    ${connection.arrival}
                </div>

                <div class="mainStopName">
                    ${connection.to}
                </div>

            </div>

        `;


        return main;
    }


    // ==================================================
    // TLAČÍTKO ZASTÁVEK
    // ==================================================

    function createToggle(
        stopsBox
    ) {

        const button =
            document.createElement("button");


        button.type =
            "button";


        button.className =
            "stopsToggle";


        button.textContent =
            "Zobrazit zastávky ▼";


        stopsBox.style.display =
            "none";


        button.addEventListener(
            "click",
            () => {

                const hidden =
                    stopsBox.style.display ===
                    "none";


                if (hidden) {

                    stopsBox.style.display =
                        "block";

                    button.textContent =
                        "Skrýt zastávky ▲";

                } else {

                    stopsBox.style.display =
                        "none";

                    button.textContent =
                        "Zobrazit zastávky ▼";
                }
            }
        );


        return button;
    }


    // ==================================================
    // PŘÍMÝ SPOJ
    // ==================================================

    function createDirectResult(
        connection
    ) {

        const route =
            getRouteInfo(
                connection.line
            );


        const card =
            document.createElement("div");


        card.className =
            "resultCard";


        card.style.borderLeft =
            `8px solid ${route.color}`;


        // ------------------------------------------
        // LINKA
        // ------------------------------------------

        card.appendChild(
            createLineHeader(
                connection.line,
                connection.destination
            )
        );


        // ------------------------------------------
        // ČASY
        // ------------------------------------------

        card.appendChild(
            createMainTimes(
                connection
            )
        );


        // ------------------------------------------
        // ZASTÁVKY
        // ------------------------------------------

        const stopsBox =
            createStopsBox(
                connection.stops,
                connection.line
            );


        card.appendChild(
            stopsBox
        );


        // ------------------------------------------
        // TLAČÍTKO
        // ------------------------------------------

        card.appendChild(
            createToggle(
                stopsBox
            )
        );


        return card;
    }


    // ==================================================
    // JEDNA ČÁST PŘESTUPU
    // ==================================================

    function createTransferPart(
        connection,
        number
    ) {

        const wrapper =
            document.createElement("div");


        wrapper.className =
            "transferPart";


        // ------------------------------------------
        // ČÍSLO SPOJE
        // ------------------------------------------

        const title =
            document.createElement("div");


        title.className =
            "transferTitle";


        title.textContent =
            `${number}. spoj`;


        wrapper.appendChild(
            title
        );


        // ------------------------------------------
        // LINKA
        // ------------------------------------------

        wrapper.appendChild(
            createLineHeader(
                connection.line,
                connection.destination
            )
        );


        // ------------------------------------------
        // ČASY
        // ------------------------------------------

        wrapper.appendChild(
            createMainTimes(
                connection
            )
        );


        // ------------------------------------------
        // ZASTÁVKY
        // ------------------------------------------

        const stopsBox =
            createStopsBox(
                connection.stops,
                connection.line
            );


        wrapper.appendChild(
            stopsBox
        );


        return {
            wrapper,
            stopsBox
        };
    }


    // ==================================================
    // PŘESTUPNÍ SPOJ
    // ==================================================

    function createTransferResult(
        connection
    ) {

        const card =
            document.createElement("div");


        card.className =
            "resultCard";


        card.style.borderLeft =
            "8px solid #777";


        // ------------------------------------------
        // PRVNÍ SPOJ
        // ------------------------------------------

        const first =
            createTransferPart(
                connection.first,
                1
            );


        card.appendChild(
            first.wrapper
        );


        // ------------------------------------------
        // PŘESTUP
        // ------------------------------------------

        const transfer =
            document.createElement("div");


        transfer.className =
            "transferStop";


        transfer.innerHTML = `

            <span>
                🔄
            </span>

            <strong>
                Přestup:
            </strong>

            ${connection.transferStop}

        `;


        card.appendChild(
            transfer
        );


        // ------------------------------------------
        // DRUHÝ SPOJ
        // ------------------------------------------

        const second =
            createTransferPart(
                connection.second,
                2
            );


        card.appendChild(
            second.wrapper
        );


        // ------------------------------------------
        // ZASTÁVKY JSOU SKRYTÉ
        // ------------------------------------------

        first.stopsBox.style.display =
            "none";

        second.stopsBox.style.display =
            "none";


        // ------------------------------------------
        // TLAČÍTKO
        // ------------------------------------------

        const button =
            document.createElement("button");


        button.type =
            "button";


        button.className =
            "stopsToggle";


        button.textContent =
            "Zobrazit zastávky ▼";


        button.addEventListener(
            "click",
            () => {

                const hidden =
                    first.stopsBox.style.display ===
                    "none";


                if (hidden) {

                    first.stopsBox.style.display =
                        "block";

                    second.stopsBox.style.display =
                        "block";

                    button.textContent =
                        "Skrýt zastávky ▲";

                } else {

                    first.stopsBox.style.display =
                        "none";

                    second.stopsBox.style.display =
                        "none";

                    button.textContent =
                        "Zobrazit zastávky ▼";
                }
            }
        );


        card.appendChild(
            button
        );


        return card;
    }


    // ==================================================
    // VYHLEDÁVÁNÍ
    // ==================================================

    searchButton.addEventListener(
        "click",
        async (event) => {

            event.preventDefault();


            const from =
                fromInput.value.trim();


            const to =
                toInput.value.trim();


            const afterTime =
                timeInput &&
                timeInput.value
                    ? timeInput.value
                    : "00:00";


            // ------------------------------------------
            // KONTROLA
            // ------------------------------------------

            if (!from || !to) {

                resultsContainer.innerHTML = `
                    <div class="resultCard">
                        <strong>
                            Vyber výchozí a cílovou zastávku.
                        </strong>
                    </div>
                `;

                return;
            }


            if (
                from.toLowerCase() ===
                to.toLowerCase()
            ) {

                resultsContainer.innerHTML = `
                    <div class="resultCard">
                        Výchozí a cílová zastávka
                        musí být rozdílné.
                    </div>
                `;

                return;
            }


            // ------------------------------------------
            // VYHLEDÁVÁNÍ
            // ------------------------------------------

            resultsContainer.innerHTML = `
                <div class="resultCard">
                    Vyhledávám spojení…
                </div>
            `;


            try {

                const dayType =
                    getDayType();


                const lineNumbers =
                    routes.map(
                        route =>
                            String(route.line)
                    );


                console.log(
                    "Hledám:",
                    from,
                    "→",
                    to,
                    "od",
                    afterTime,
                    dayType
                );


                const connections =
                    await window.searchTimetable
                        .findConnections(
                            from,
                            to,
                            afterTime,
                            dayType,
                            lineNumbers
                        );


                console.log(
                    "Výsledky:",
                    connections
                );


                resultsContainer.innerHTML =
                    "";


                // ------------------------------------------
                // ŽÁDNÝ VÝSLEDEK
                // ------------------------------------------

                if (
                    !connections ||
                    connections.length === 0
                ) {

                    resultsContainer.innerHTML = `
                        <div class="resultCard">

                            <strong>
                                Spojení nebylo nalezeno.
                            </strong>

                            <p>
                                ${from}
                                →
                                ${to}
                            </p>

                        </div>
                    `;

                    return;
                }


                // ------------------------------------------
                // VÝSLEDKY
                // ------------------------------------------

                for (
                    const connection
                    of connections
                ) {

                    let card;


                    if (
                        connection.type ===
                        "transfer"
                    ) {

                        card =
                            createTransferResult(
                                connection
                            );

                    } else {

                        card =
                            createDirectResult(
                                connection
                            );
                    }


                    resultsContainer.appendChild(
                        card
                    );
                }


            } catch (error) {

                console.error(
                    "CHYBA PŘI VYHLEDÁVÁNÍ:",
                    error
                );


                resultsContainer.innerHTML = `
                    <div class="resultCard">

                        <strong>
                            Chyba při vyhledávání
                        </strong>

                        <p>
                            ${error.message}
                        </p>

                        <small>
                            Podrobnosti jsou v konzoli prohlížeče.
                        </small>

                    </div>
                `;
            }
        }
    );

});
