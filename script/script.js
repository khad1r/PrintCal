const viewer = document.querySelector('.document'),
    settingsBTN = document.querySelector('#setting-btn'),
    dropArea = document.querySelector(".drag-area"),
    filePicker = dropArea.querySelector("#file"),
    dragText = dropArea.querySelector(".drag-area-header"),
    nav = document.querySelector(".nav-menu"),
    loading = document.querySelector(".loading"),
    settings = nav.querySelectorAll("input"),
    pageInput = viewer.querySelector("#current_page");

let PDFJS_NEEDED = true,
    PAGES = [],
    OVERALL_PAGES = {
        'overalPrice': 0,
        'colorPages': [],
    },
    SETTING = loadSettings(),
    FILE,
    CURRENT_PAGE,
    TOTAL_PAGE,
    PRICE_FORMAT = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' });

settings.forEach(setting => {
    setting.addEventListener("change", event => {
        saveSettings();
    })
})
// filePicker.addEventListener("change", loadFile);
filePicker.addEventListener("change", function () {
    //getting user select file and [0] this means if user select multiple files then we'll select only the first one
    FILE = this.files[0];
    dropArea.classList.add("active");
    loadFile(); //calling function
});
document.querySelector("#prev_btn").addEventListener("click", e => {
    if (CURRENT_PAGE == 1) return;
    activatedPage(CURRENT_PAGE - 1);
})
document.querySelector("#next_btn").addEventListener("click", e => {
    if (CURRENT_PAGE == TOTAL_PAGE) return;
    activatedPage(CURRENT_PAGE + 1);
})
pageInput.addEventListener("change", e => {
    if (CURRENT_PAGE == 1 || CURRENT_PAGE == TOTAL_PAGE) {
        pageInput.value = currentPage;
        return
    }
    activatedPage(pageInput.value)

})
//If user Drag File Over DropArea
dropArea.addEventListener("dragover", (event) => {
    event.preventDefault(); //preventing from default behaviour
    dropArea.classList.add("active");
    dragText.textContent = "Release to Upload File";
});

//If user leave dragged File from DropArea
dropArea.addEventListener("dragleave", () => {
    dropArea.classList.remove("active");
    dragText.textContent = "Drag & Drop to Upload File";
});

//If user drop File on DropArea
dropArea.addEventListener("drop", (event) => {
    event.preventDefault(); //preventing from default behaviour
    dropArea.classList.remove("active");
    //getting user select file and [0] this means if user select multiple files then we'll select only the first one
    FILE = event.dataTransfer.files[0];
    loadFile(); //calling function
});
settingsBTN.addEventListener('click', (event) => {
    event.preventDefault(); //preventing from default behaviour
    document.querySelector(".menu-btn").classList.toggle("active");
    document.querySelector(".main-nav").classList.toggle("active");
})

async function loadFile() {
    try {
        dropArea.parentNode.style.display = 'none';
        loading.style.display = 'block';
        const typ = FILE.type;
        if (typ !== "application/pdf") throw 'Not A PDF file'
        if (PDFJS_NEEDED) {
            const res = await load_script('/script/pdf.js', '/script/pdf.worker.js');
            if (res instanceof Error) {
                console.log(res);
                return;
            }
            PDFJS_NEEDED = false;
        }
        const res = await loadPDF(FILE);
    } catch (e) {
        alert(e);
    } finally {
        // PAGES.forEach(page => {
        //     OVERALL_PAGES['overalPrice'] += page['price'];
        // })

    }
}


function load_script(...ff) {
    const pp = [];
    ff.forEach(f => {
        const p = new Promise((resolve, reject) => {
            const s = document.createElement("script");
            s.onload = resolve;
            s.onerror = reject;
            s.src = f;
            document.body.appendChild(s);
        });
        pp.push(p);
    });
    return Promise.all(pp);
}

async function loadPDF(file) {
    const get_pdf_content = new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = function () {
            resolve(new Uint8Array(r.result));
        };
        r.onerror = reject;
        r.readAsArrayBuffer(file);
    });

    const pdf = await get_pdf_content;

    const doc = await pdfjsLib.getDocument(pdf).promise;
    TOTAL_PAGE = doc.numPages;
    for (CURRENT_PAGE = 1; CURRENT_PAGE <= TOTAL_PAGE; CURRENT_PAGE++) {
        let thePage = await doc.getPage(CURRENT_PAGE);
        let canvas = document.createElement("canvas");
        let num = CURRENT_PAGE;

        const res = await renderPDFPage(canvas, thePage);
        await res.promise;
        let imgURL = canvas.toDataURL(),
            RGBcolor, CMYKcolor, price;
        let img = document.createElement("img");
        img.className = 'page';
        img.style.width = '200px';
        img.src = imgURL
        viewer.appendChild(img);
        // viewer.appendChild(canvas);
        img.addEventListener("load", async function () {
            canvas.height = canvas.height * SETTING["calScale"];
            canvas.width = canvas.width * SETTING["calScale"];
            let ctx = canvas.getContext('2d');
            ctx.scale(SETTING["calScale"], SETTING["calScale"]);
            ctx.drawImage(img, 0, 0);
            let imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            [RGBcolor, CMYKcolor] = colorsCoverage(imgData.data);
            img.remove();
            canvas.remove();
            price = calcPrice(...CMYKcolor)
            if (price > SETTING["rule"][3][1]) OVERALL_PAGES['colorPages'].push(num)
            PAGES.push({
                'imgURL': imgURL,
                'RGBcolor': RGBcolor,
                'CMYKcolor': CMYKcolor,
                'price': price
            })
            if (num == TOTAL_PAGE) finalize()
        });
    }
}

function finalize() {
    activatedPage(1);
    document.querySelector('#total-price').textContent = PRICE_FORMAT.format(OVERALL_PAGES['overalPrice']);
    generatedColoredPagesBtn();
    loading.style.display = 'none';
}
async function renderPDFPage(canvas, page) {
    const dpi = 96 * window.devicePixelRatio;
    const scale = dpi / 72;
    let viewport = page.getViewport({ scale: scale });
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    let ctx = canvas.getContext('2d');
    return await page.render({ canvasContext: ctx, viewport: viewport });
}

function colorsCoverage(data) {
    var RGB = [0, 0, 0], CMYK = [0, 0, 0, 0];
    var pixel = 0;
    for (let i = 0; i < data.length; i += 4) {
        let alpha = clamp(data[i + 3], 0, 255, 0, 1);
        let val = rgba_bkg(data[i], data[i + 1], data[i + 2], alpha, 255, 255, 255);
        // cmyk is suspect
        RGB = [RGB[0] + val[0], RGB[1] + val[1], RGB[2] + val[2]]
        val = rgb_cmyk(val[0], val[1], val[2]);
        CMYK = [CMYK[0] + val[0], CMYK[1] + val[1], CMYK[2] + val[2], CMYK[3] + val[3]]
        // CMYK[0] += val[0];
        // CMYK[1] += val[1];
        // CMYK[2] += val[2];
        // CMYK[3] += val[3];

        pixel++;
    }
    RGB = RGB.map((x) => x / pixel);
    CMYK = CMYK.map((x) => x / pixel);
    return [RGB, CMYK]
}

function clamp(me, in_min, in_max, out_min, out_max) {
    return ((me - in_min) * (out_max - out_min)) / (in_max - in_min) + out_min;
}

function rgba_bkg(r, g, b, a, r2, g2, b2) {
    var r3 = Math.round((1 - a) * r2 + a * r);
    var g3 = Math.round((1 - a) * g2 + a * g);
    var b3 = Math.round((1 - a) * b2 + a * b);
    return [r3, g3, b3];
}

function rgb_cmyk(r, g, b) {
    var computedC = 0;
    var computedM = 0;
    var computedY = 0;
    var computedK = 0;

    if (r == 0 && g == 0 && b == 0) {
        return [0, 0, 0, 1];
    }

    computedC = 1 - r / 255;
    computedM = 1 - g / 255;
    computedY = 1 - b / 255;

    var minCMY = Math.min(computedC, Math.min(computedM, computedY));
    // push cmy to black
    computedC = (computedC - minCMY) / (1 - minCMY);
    computedM = (computedM - minCMY) / (1 - minCMY);
    computedY = (computedY - minCMY) / (1 - minCMY);
    computedK = minCMY;

    // push black to cmy - convert cmyk to cmy
    var blackC = computedC * (1 - computedK) + computedK;
    var blackM = computedM * (1 - computedK) + computedK;
    var blackY = computedY * (1 - computedK) + computedK;

    var pureK =
        computedK -
        (blackC - computedC + (blackM - computedM) + (blackY - computedY));
    pureK = Math.max(0, pureK);
    // return [blackC, blackM, blackY, pureK];
    return [computedC, computedM, computedY, computedK];
}

function calcPrice(c, m, y, k) {
    let price;
    if (c + m + y > SETTING["rule"][0][0]) price = parseInt(SETTING["rule"][0][1])
    else if (c + m + y > SETTING["rule"][1][0]) price = parseInt(SETTING["rule"][1][1])
    else if (k > SETTING["rule"][2][0]) price = parseInt(SETTING["rule"][2][1]);
    else if (k >= SETTING["rule"][3][0]) price = parseInt(SETTING["rule"][3][1])
    OVERALL_PAGES['overalPrice'] += price;
    return price;
}

function activatedPage(numPage) {
    CURRENT_PAGE = numPage;
    let page = PAGES[numPage - 1];
    console
    document.querySelector('#page').textContent = numPage;
    pageInput.value = numPage
    document.querySelector('#cyan-percentage').textContent = (page.CMYKcolor[0] * 100).toFixed(2);
    document.querySelector('#magenta-percentage').textContent = (page.CMYKcolor[1] * 100).toFixed(2);
    document.querySelector('#yellow-percentage').textContent = (page.CMYKcolor[2] * 100).toFixed(2);
    document.querySelector('#black-percentage').textContent = (page.CMYKcolor[3] * 100).toFixed(2);
    document.querySelector('#page-price').textContent = PRICE_FORMAT.format(page.price);
    viewer.querySelector("#document-viewer").src = page.imgURL;
}

function getSetting() {
    if (localStorage.getItem('printCalSetting') === null) {
        let set = {
            "calScale": 0.5,
            "rule": [[0.01, 500], [0.25, 1000], [0.25, 500], [0, 300]]
        };
        localStorage.setItem('printCalSetting', JSON.stringify(set));
        return set
    } else {
        return JSON.parse(localStorage.getItem('printCalSetting'));
    }
}

function loadSettings() {
    let settings = getSetting();
    nav.querySelector('#calculate_scale').value = settings["calScale"] * 100;
    nav.querySelector('#rule1-percentage').value = settings["rule"][0][0] * 100;
    nav.querySelector('#rule2-percentage').value = settings["rule"][1][0] * 100;
    nav.querySelector('#rule3-percentage').value = settings["rule"][2][0] * 100;
    nav.querySelector('#rule4-percentage').value = settings["rule"][3][0] * 100;
    nav.querySelector('#rule1-price').value = settings["rule"][0][1];
    nav.querySelector('#rule2-price').value = settings["rule"][1][1];
    nav.querySelector('#rule3-price').value = settings["rule"][2][1];
    nav.querySelector('#rule4-price').value = settings["rule"][3][1];
    return settings
}

function saveSettings() {
    let calScale = nav.querySelector('#calculate_scale');
    let r1Pecent = nav.querySelector('#rule1-percentage');
    let r2Pecent = nav.querySelector('#rule2-percentage');
    let r3Pecent = nav.querySelector('#rule3-percentage');
    let r4Pecent = nav.querySelector('#rule4-percentage');
    let r1Price = nav.querySelector('#rule1-price');
    let r2Price = nav.querySelector('#rule2-price');
    let r3Price = nav.querySelector('#rule3-price');
    let r4Price = nav.querySelector('#rule4-price');
    if (calScale.value < 0 || calScale.value > 100 || r1Pecent.value < 0 || r1Pecent.value > 100 || r2Pecent.value < 0 || r2Pecent.value > 100 || r3Pecent.value < 0 || r3Pecent.value > 100 || r4Pecent.value < 0 || r4Pecent.value > 100) {
        alert("Invalid Percentage Number");
        calScale.value = SETTING["calScale"] * 100
        r1Pecent.value = SETTING["rule"][0][0] * 100
        r2Pecent.value = SETTING["rule"][1][0] * 100
        r3Pecent.value = SETTING["rule"][2][0] * 100
        r4Pecent.value = SETTING["rule"][3][0] * 100
        return
    }
    SETTING = {
        "calScale": calScale.value / 100,
        "rule": [
            [r1Pecent.value / 100, r1Price.value],
            [r2Pecent.value / 100, r2Price.value],
            [r3Pecent.value / 100, r3Price.value],
            [r4Pecent.value / 100, r4Price.value],
        ]
    };
    localStorage.setItem('printCalSetting', JSON.stringify(SETTING));
}

function generatedColoredPagesBtn() {
    let area = document.querySelector('#colorPages');
    OVERALL_PAGES['colorPages'].forEach(numPage => {
        let btn = document.createElement('button');
        btn.textContent = numPage;
        btn.addEventListener('click', e => {
            activatedPage(numPage);
        })
        area.appendChild(btn);
    });
}