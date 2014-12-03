var canvas = document.getElementById("shadow_image");
var ctx = canvas.getContext("2d");

var SHADOW_TYPE = {Rect: 1, Ellipse: 2};
var BOX_RESIZE_TYPE = {None:0, Right:1, Bottom:2, Corner:3};

var boundPos = {leftPos: -1, topPos: -1, rightPos: -1, bottomPos: -1};
var shadowColor, fillColor, outlineColor, shadowBlur, shadowOffsetX, shadowOffsetY,
    outlineWidth, isTransparentFill, currentType, roundRadius, hideNinepatches;
var updateDelayId;
var objectWidth = 200, objectHeight = 200;
var boxResizeMode = 0, boxResizeData = null, BOX_ANCHOR = 6;
var CANVAS_MAX_WIDTH = 1000, CANVAS_MAX_HEIGHT = 1000;

/*CanvasRenderingContext2D.prototype.ellipse = function (x, y, r) {
    this.beginPath();
    this.arc(x, y, r, 0, 2 * Math.PI);
    this.closePath()
};*/

CanvasRenderingContext2D.prototype.roundRect = function (x, y, width, height, radius) {
    var cornerRadius = {upperLeft: 0, upperRight: 0, lowerLeft: 0, lowerRight: 0};

    if (typeof radius === "object") {
        for (var side in radius) {
            cornerRadius[side] = radius[side];
        }
    }

    this.beginPath();
    this.moveTo(x + cornerRadius.upperLeft, y);
    this.lineTo(x + width - cornerRadius.upperRight, y);
    this.quadraticCurveTo(x + width, y, x + width, y + cornerRadius.upperRight);
    this.lineTo(x + width, y + height - cornerRadius.lowerRight);
    this.quadraticCurveTo(x + width, y + height, x + width - cornerRadius.lowerRight, y + height);
    this.lineTo(x + cornerRadius.lowerLeft, y + height);
    this.quadraticCurveTo(x, y + height, x, y + height - cornerRadius.lowerLeft);
    this.lineTo(x, y + cornerRadius.upperLeft);
    this.quadraticCurveTo(x, y, x + cornerRadius.upperLeft, y);
    this.closePath();
};

function setShadow(x, y, b, c) {
    ctx.shadowOffsetX = x;
    ctx.shadowOffsetY = y;
    ctx.shadowBlur = b;
    ctx.shadowColor = c;
}

function exportAsPng() {
    var date = new Date();
    bootbox.prompt({
        title: "Enter output filename (without '.9.png')",
        value: "shadow_" + date.getHours() + "" + date.getMinutes() + "" + date.getSeconds(),
        callback: function(result) {
            if (result !== null && result !== "") {
                //Show ninepatches If hidden when exporting
                var hideNinepatchesTmp = false;
                if (hideNinepatches) {
                    hideNinepatchesTmp = true;
                    hideNinepatches = false;
                    redraw();
                }

                //Use BlobHD If supported
                if (canvas.toBlobHD) {
                    canvas.toBlobHD(function (blob) {
                        saveAs(blob, result + ".9.png");
                    });
                } else {
                    canvas.toBlob(function (blob) {
                        saveAs(blob, result + ".9.png");
                    });
                }

                if (hideNinepatchesTmp) {
                    hideNinepatches = hideNinepatchesTmp;
                    redraw();
                }
            }
        }
    });
}

function drawShadowRect(w, h, radius, fast) {
    drawShadow(w, h, radius, SHADOW_TYPE.Rect);
}

/*function drawShadowEllipse(r) {
    drawShadow(r / 2, r / 2, null, SHADOW_TYPE.Ellipse);
}*/

function drawShadow(w, h, radius, type) {
    canvas.width = CANVAS_MAX_WIDTH;
    canvas.height = CANVAS_MAX_HEIGHT;

    //First time draw with filled background
    //for calculating final size of ninepatch
    var transparentTmp = isTransparentFill;
    isTransparentFill = false;
    drawShadowInternal(w, h, radius, type, true);
    updateBounds();
    isTransparentFill = transparentTmp;
    ctx.clearRect(0,0, canvas.width, canvas.height);

    canvas.width = canvas.width - (boundPos.leftPos + boundPos.rightPos);
    canvas.height = canvas.height - (boundPos.topPos + boundPos.bottomPos);
    drawNinepatchLines(w, h);
    drawShadowInternal(w, h, radius, type, false, true);
}

function drawShadowInternal(w, h, radius, type, center, translate) {
    var centerPosX = (canvas.width / 2) - (w / 2);
    var centerPosY = (canvas.height / 2) - (h / 2);
    var x = 0, y = 0;
    var offsetForTransparent = -9999;

    ctx.save();
    if (isTransparentFill) ctx.translate(offsetForTransparent, offsetForTransparent);

    if (type == SHADOW_TYPE.Rect) {
        if (center) {
            x = centerPosX;
            y = centerPosY;
        } else if (translate) {
            x = getRelativeX();
            y = getRelativeY();
        }
        if (boxResizeMode != BOX_RESIZE_TYPE.None) {
            x -= shadowOffsetX;
            y -= shadowOffsetY;
        }
        ctx.roundRect(x, y, w, h, radius);
    } else {
        //ctx.ellipse(x, y, w);
    }

    if (!isTransparentFill) {
        ctx.fillStyle = fillColor;
        setShadow(shadowOffsetX, shadowOffsetY, shadowBlur, shadowColor);
    } else {
        setShadow(shadowOffsetX - offsetForTransparent, shadowOffsetY - offsetForTransparent, shadowBlur, shadowColor);
    }

    ctx.fill();

    if (!isTransparentFill && outlineWidth > 0) {
        setShadow(0,0,0,0);
        ctx.strokeStyle = outlineColor;
        ctx.lineWidth = outlineWidth;
        ctx.stroke();
    }

    ctx.restore();

    if (isTransparentFill) {

        ctx.globalCompositeOperation = 'destination-out';
        ctx.save();
        if (center) {
            x = centerPosX;
            y = centerPosY;
        } else if (translate) {
            x = getRelativeX();
            y = getRelativeY();
        }
        if (boxResizeMode != BOX_RESIZE_TYPE.None) {
            x -= shadowOffsetX;
            y -= shadowOffsetY;
        }
        ctx.roundRect(x, y, w, h, radius);
        ctx.fill();
        ctx.restore();
    }

}

function getRelativeX() {
    return (CANVAS_MAX_WIDTH / 2) - (objectWidth / 2) - boundPos.leftPos;
}

function getRelativeY() {
    return (CANVAS_MAX_HEIGHT / 2) - (objectHeight / 2) - boundPos.topPos;
}

function searchForNonAlphaPixel(row, col, imgPixels, width, height, opposite) {
    var pos, alfa, pos2, alfa2;

    pos = ((Math.round(row) * (width * 4)) + (Math.round(col) * 4));
    pos2 = ((Math.round(height - row - 1) * (width * 4)) + (Math.round(width - col - 1) * 4));

    alfa = imgPixels[pos + 3];
    alfa2 = imgPixels[pos2 + 3];

    //-1 because of ninepatch lines
    if (!opposite) {
        if (alfa != 0 && boundPos.leftPos == -1) {
            boundPos.leftPos = col - 1;
        }
        if (alfa2 != 0 && boundPos.rightPos == -1) {
            boundPos.rightPos = col - 2;
        }
    } else {
        if (alfa != 0 && boundPos.topPos == -1) {
            boundPos.topPos = row - 1;
        }
        if (alfa2 != 0 && boundPos.bottomPos == -1) {
            boundPos.bottomPos = row - 2;
        }
    }
}

function updateBounds() {
    boundPos.leftPos = boundPos.rightPos = boundPos.bottomPos = boundPos.topPos = -1;

    var imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    var row, col;

    //search vertically
    for (col = 0; col < imgData.width; col++) {
        for (row = 0; row < imgData.height; row++) {
            searchForNonAlphaPixel(row, col, imgData.data, imgData.width, imgData.height, false);
        }
    }

    //search horizontally
    for (row = 0; row < imgData.height; row++) {
        for (col = 0; col < imgData.width; col++) {
            searchForNonAlphaPixel(row, col, imgData.data, imgData.width, imgData.height, true);
        }
    }
}

function drawNinepatchLines(w, h) {
    if (hideNinepatches) {
        return;
    }
    var lineWidthPatch = 4;

    ctx.strokeStyle = "black";
    ctx.lineWidth = 2;

    var offsetX = getRelativeX();
    var offsetY = getRelativeY();

    //Draw left
    s = h / 2;
    ctx.moveTo(0, offsetY + s - lineWidthPatch / 2);
    ctx.lineTo(0, offsetY + s + lineWidthPatch);

    //Draw top
    s = w / 2;
    ctx.moveTo(offsetX + s - lineWidthPatch / 2, 0);
    ctx.lineTo(offsetX + s + lineWidthPatch, 0);

    //Draw right
    ctx.moveTo(canvas.width, offsetY);
    ctx.lineTo(canvas.width, offsetY + h);

    //Draw bottom
    ctx.moveTo(offsetX, canvas.height);
    ctx.lineTo(offsetX + w, canvas.height);

    ctx.stroke();
}

function redraw() {
    //Limit ranges for input
    var minRadius = 0, maxRadius = 500;
    var minOffset = -500, maxOffset = 500;
    var minBlur = 0, maxBlur = 500;
    var minOutlineW = 0, maxOutlineW = 99;

    var colorFill = $("#color-picker-fill-input");
    var outlineFill = $("#color-picker-outline-input");
    var colorShadow = $("#color-picker-shadow-input");

    shadowBlur = parseFloatAndClamp($("#shadow-blur").val(), minBlur, maxBlur);
    shadowOffsetX = parseFloatAndClamp($("#shadow-offset-x").val(), minOffset, maxOffset, 0);
    shadowOffsetY = parseFloatAndClamp($("#shadow-offset-y").val(), minOffset, maxOffset, 0);
    outlineWidth = parseFloatAndClamp($("#outline-width-input").val(), minOutlineW, maxOutlineW);
    isTransparentFill = colorFill.prop("disabled");

    shadowColor = colorShadow.val();
    fillColor = colorFill.val();
    outlineColor = outlineFill.val();
    //currentType = $("#rectOpt").is(":checked") ? SHADOW_TYPE.Rect : SHADOW_TYPE.Ellipse;

    roundRadius = {
        upperLeft: parseFloatAndClamp($("#shadow-round-tl").val(), minRadius, maxRadius),
        upperRight: parseFloatAndClamp($("#shadow-round-tr").val(), minRadius, maxRadius),
        lowerLeft: parseFloatAndClamp($("#shadow-round-bl").val(), minRadius, maxRadius),
        lowerRight: parseFloatAndClamp($("#shadow-round-br").val(), minRadius, maxRadius)
    };

    currentType = SHADOW_TYPE.Rect;

    if (currentType == SHADOW_TYPE.Rect) {
        drawShadowRect(objectWidth, objectHeight, roundRadius);
    } else {
        //drawShadowEllipse(260);
    }
}

function parseFloatAndClamp(val, min, max, noneValue) {
    var num = parseFloat(val);
    if (isNaN(num)) {
        return (typeof noneValue !== "undefined") ? noneValue : min;
    } else {
        return Math.min(Math.max(min, val), max);
    }
}

function updateDelay() {
    clearTimeout(updateDelayId);
    updateDelayId = window.setTimeout(function () {
        redraw();
    }, 150);
}

function setRoundSimple(val) {
    $("#shadow-round-tl").val(val);
    $("#shadow-round-tr").val(val);
    $("#shadow-round-bl").val(val);
    $("#shadow-round-br").val(val);
}

/** Implementation **/

$(document).ready(function () {
    $("#shadow-blur, #shadow-offset-x, #shadow-offset-y, #shadow-round-bl, " +
    "#shadow-round-br, #shadow-round-tl, #shadow-round-tr, #outline-width-input").on("input", function() {
        updateDelay();
    });

    $("#round-simple-input").on("input", function () {
        setRoundSimple($(this).val());
        updateDelay();
    });

    $("#rectOpt, #ellipseOpt").click(function () {
        updateDelay();
    });

    $("#color-picker-shadow, #color-picker-fill, #color-picker-outline").colorpicker().on("changeColor", function(ev) {
        updateDelay();
    });

    var enableTxt = "enable";
    var disableTxt = "disable";
    var input = "#color-picker-fill-input, #outline-width-input";
    $("#fill-toggle").click(function () {
        if ($(this).text() == enableTxt) {
            $(this).text(disableTxt);
            $(input).prop("disabled", false);
            $("#outline-group").fadeIn("slow");
        } else {
            $(this).text(enableTxt);
            $(input).prop("disabled", true);
            $("#outline-group").fadeOut();
        }

        redraw();
        $(this).blur();
    });

    $("#round-toggle").click(function () {
        var advanced = "advanced";
        var simple = "simple";

        if ($(this).text() == advanced) {
            $(this).text(simple);
            $("#round-simple").hide();
            $("#round-advanced").fadeIn("slow");
        } else {
            $(this).text(advanced);
            setRoundSimple($("#round-simple-input").val());
            $("#round-advanced").hide();
            $("#round-simple").fadeIn("slow");
        }

        redraw();
        $(this).blur();
    });

    $("#hide-patches").click(function () {
        hideNinepatches = $(this).is(":checked");
        updateDelay();
    });

    //Resizing box
    $(this).mousemove(function f(e) {
        var mousePos = getMousePos(canvas, e);

        if (boxResizeMode != BOX_RESIZE_TYPE.None) {
            var minObjectSize = 10;
            var draw = false;
            var objectWidthChanged = boxResizeData.startSizeObject.width + mousePos.x - boxResizeData.startPos.x;
            var objectHeightChanged = boxResizeData.startSizeObject.height + mousePos.y - boxResizeData.startPos.y;

            if ((boxResizeMode == BOX_RESIZE_TYPE.Right || boxResizeMode == BOX_RESIZE_TYPE.Corner) && objectWidthChanged > minObjectSize) {
                canvas.width = boxResizeData.startSizeCanvas.width + mousePos.x - boxResizeData.startPos.x;
                objectWidth = objectWidthChanged;
                draw = true;
            }

            if ((boxResizeMode == BOX_RESIZE_TYPE.Bottom || boxResizeMode == BOX_RESIZE_TYPE.Corner) && objectHeightChanged > minObjectSize) {
                canvas.height = boxResizeData.startSizeCanvas.height + mousePos.y - boxResizeData.startPos.y;
                objectHeight = objectHeightChanged;
                draw = true;
            }

            if (draw) {
                drawShadowInternal(objectWidth, objectHeight, roundRadius, currentType, true, false);
            }
        } else {
            isAnchor(e);
        }
    });

    $(this).mousedown(function f(e) {
        if (isAnchor(e)) {
            boxResizeData = {
                startPos: getMousePos(canvas, e),
                startSizeCanvas:{width:canvas.width, height:canvas.height},
                startSizeObject:{width:objectWidth, height:objectHeight}
            };
        }
    });
    $(this).mouseup(function f(e) {
        if (boxResizeMode != BOX_RESIZE_TYPE.None) {
            boxResizeData = null;
            boxResizeMode = BOX_RESIZE_TYPE.None;
            redraw();
        }
    });

    redraw();
});

function isAnchor(e) {
    var mousePos = getMousePos(canvas, e);
    var rectLeft = getRelativeX();
    var rectTop = getRelativeY();
    var rectRight = rectLeft + objectWidth;
    var rectBottom = rectTop + objectHeight;

    if (boxSideCheck(mousePos, rectRight - BOX_ANCHOR, rectRight + BOX_ANCHOR, rectBottom - BOX_ANCHOR, rectBottom + BOX_ANCHOR)) {
        $(canvas).css("cursor", "se-resize");
        if (boxResizeData != null) boxResizeMode = BOX_RESIZE_TYPE.Corner;
        return true;
    } else if (boxSideCheck(mousePos, rectRight, rectRight, rectTop, rectBottom - BOX_ANCHOR)) {
        $(canvas).css("cursor", "w-resize");
        console.log("w");
        if (boxResizeData != null) boxResizeMode = BOX_RESIZE_TYPE.Right;
        return true;
    } else if (boxSideCheck(mousePos, rectLeft, rectRight - BOX_ANCHOR, rectBottom, rectBottom)) {
        $(canvas).css("cursor", "s-resize");
        if (boxResizeData != null) boxResizeMode = BOX_RESIZE_TYPE.Bottom;
        return true;
    } else {
        $(canvas).css("cursor", "default");
        return false;
    }
}

function boxSideCheck(mousePos, x1, x2, y1, y2) {
    return pointRectangleIntersection({x: mousePos.x, y:mousePos.y}, {x1: x1-BOX_ANCHOR, x2: x2+BOX_ANCHOR, y1: y1-BOX_ANCHOR, y2: y2+BOX_ANCHOR})
}

function getMousePos(canvas, evt) {
    var rect = canvas.getBoundingClientRect();
    return {
        x: evt.clientX - rect.left,
        y: evt.clientY - rect.top
    };
}

function pointRectangleIntersection(p, r) {
    return p.x > r.x1 && p.x < r.x2 && p.y > r.y1 && p.y < r.y2;
}